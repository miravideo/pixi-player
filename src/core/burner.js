import EventEmitter from "eventemitter3";
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import Queue from '../util/queue';
import XhrUtil from '../util/xhr';
import AudioUtil from '../util/audio';
import Utils from '../util/utils';

if (!global.SharedArrayBuffer) {
  global.SharedArrayBuffer = ArrayBuffer;
}

const MAX_Q_LEN = 2;
const CLIP_SIZE = 24; // 24*5;
const FORMAT = 'jpeg'; // jpeg | bmp
const DEFAULT_OPTS = {
  useCache: true,
  useSingleThread: Utils.isMoble(),
  preset: 'ultrafast', crf: '23', format: FORMAT,
  maxQueueLen: MAX_Q_LEN, clipSize: CLIP_SIZE,
  corePath: 'https://cos.mirav.cn/player/ffmpeg/',
  coreStPath: 'https://cos.mirav.cn/player/ffmpeg-st/',
};

const WASM_FILES = {
  corePath: 'ffmpeg-core.js',
  workerPath: 'ffmpeg-core.worker.js',
  wasmPath: 'ffmpeg-core.wasm',
}

class Burner extends EventEmitter {
  constructor(opts) {
    super();

    this.opts = {...DEFAULT_OPTS, ...opts};
    this.burning = false;
    this.extractQueue = new Queue();
    this.clipBurnQueue = new Queue();
  }

  async init(progress=()=>{}) {
    if (this.ffmpeg && this.ffmpeg.isLoaded()) {
      progress && progress(1.0);
      return;
    }

    // todo: hardcode size
    const _total = { corePath: 106139, workerPath: 3609, wasmPath: 24354956 };
    const _loaded = { corePath: 0, workerPath: 0, wasmPath: 0 };
    let _config = {};

    const uri = this.opts.useSingleThread ? this.opts.coreStPath : this.opts.corePath;
    Object.keys(_total).map(k => {
      _config[k] = uri + WASM_FILES[k];
    });

    if (this.opts.useCache) {
      const _res = {};
      const updateProgress = () => {
        let loaded = 0, total = 0;
        Object.keys(_total).map(k => {
          loaded += _loaded[k];
          total += _total[k];
        });
        const pp = total > 0 ? loaded / total : 0;
        progress && progress(pp);
      }

      for (const key of Object.keys(_total)) {
        _res[key] = XhrUtil.getCachedURL(_config[key], 'burner', (p) => {
          _loaded[key] = p.loaded || 0;
          if (p.total) _total[key] = p.total;
          updateProgress();
        });
      }

      const pathArr = await Promise.all([_res.corePath, _res.workerPath, _res.wasmPath]);
      _config = {corePath: pathArr[0].url, workerPath: pathArr[1].url, wasmPath: pathArr[2].url};
    }

    if (this.opts.useSingleThread) _config['mainName'] = 'main';
    this.ffmpeg = createFFmpeg({ 
      log: false,
      logger: ({type, message}) => console.log(type, message),
      ..._config,
    });

    // start load
    await this.ffmpeg.load();
    this.emit('ready');
    progress && progress(1.0);
  }

  get ready() {
    return this.ffmpeg && this.ffmpeg.isLoaded();
  }

  async start(player, progress=()=>{}) {
    if (!this.ffmpeg.isLoaded()) await this.ffmpeg.load();
    if (this.burning) return false;
    if (!player || !player.duration) {
      console.log('Player not ready!');
      return false;
    }
    this.jobId = Utils.genUuid();
    this.emit('start', { id: this.jobId });

    this.player = player;
    this.onProgress = progress;
    this.burnStart = Date.now();
    this.burning = true;
    this.cancelled = false;
    this.extractEnded = false;
    this.clipIdx = 0;
    this.clips = []; // for st-core reload cache

    // for audio
    const { audioSampleRate, duration } = player;
    this.audioCursor = 0;
    this.audioData = new Float32Array(Math.round(2 * duration * audioSampleRate));

    this._clipProg = 0;
    this._extractProg = 0;
    this._timer = 0;
    this.extract();
    this.onProgress && this.onProgress(0.001);
    return new Promise((resolve) => {
      this.once('done', (e) => {
        resolve(e.id === this.jobId ? e.output : null);
      });
    });
  }

  updateProgress() {
    const p = this._clipProg * 0.6 + this._extractProg * 0.4;
    // console.log('ppp', [this._clipProg, this._extractProg]);
    const progress = Math.max(0.001, p * 0.98);
    this.onProgress && this.onProgress(progress);
    this.emit('progress', { id: this.jobId, progress });
  }

  extract() {
    this.extracting = true;
    this.extractQueue.enqueue(async () => {
      if (this.cancelled) return;
      const bufferArr = [];
      const { clipSize, format } = this.opts;
      const { audioSampleRate, duration, fps } = this.player;
      const tick = 1 / fps;
      for (let i = 0; i < clipSize; i++) {
        if (this._timer > duration) {
          this.extractEnded = true;
          break;
        }

        // video
        if (this.cancelled) return;
        const imageData = await this.player.getFrameImageData(this._timer, { format });
        if (this.cancelled) return;
        bufferArr.push(imageData);

        // audio
        const size = Math.round((this._timer + tick) * audioSampleRate) - (this.audioCursor / 2);
        const abuffer = await this.player.getFrameAudioData(this._timer, { size });
        if (this.cancelled) return;
        const _adata = AudioUtil.interleave(abuffer.getChannelData(0), abuffer.getChannelData(1));
        // console.log('set audio', this.audioCursor, size, this.audioCursor / this.audioData.length);
        this.audioData.set(_adata, this.audioCursor);
        this.audioCursor += _adata.length;

        this._timer += tick;
        this._extractProg = (this._timer / duration);
        this.updateProgress();
      }

      this.extracting = false;
      if (bufferArr.length > 0) this.burnClip(bufferArr);
      // concatClip跟burnClip走同一个queue, 所以不用await直接调用
      if (this.extractEnded) {
        return this.concatClip();
      }
      // next batch
      if (bufferArr.length == this.opts.clipSize && this.clipBurnQueue.queue.length < this.opts.maxQueueLen) {
        // console.log('next....', this.clipBurnQueue.queue.length);
        this.extract();
      } else {
        // pause extract
        // console.log('pause extract', this.clipBurnQueue.queue.length);
      }
    });
  }

  burnClip(bufferArr) {
    this.clipBurnQueue.enqueue(async () => {
      const { ffmpeg } = this;
      if (!ffmpeg.isLoaded()) return;
      const ss = performance.now();

      const { fps, duration } = this.player;
      const cc = `${this.clipIdx}`.padStart(5, 0);
      const out = `clip_${cc}.mp4`;

      const totalClip = Math.ceil(duration / (this.opts.clipSize / fps));
      ffmpeg.setLogger(({ type, message }) => {
        if (!message) return;
        const res = message.match(/time=\s*([\d\:\.]+)\s*bitrate=[\s\d.]+kbits\/s\s*speed=/);
        if (res && res[1]) {
          const total = bufferArr.length / fps;
          const comp = hmsToSeconds(res[1]);
          this._clipProg = ((this.clipIdx - 1) / totalClip) + ((1 / totalClip) * (comp / total));
          // console.log('burn progress', out, comp, total, this._clipProg);
          this.updateProgress();
        }
      });

      // todo: move to extract?
      this.clipIdx++;
      const prefix = `c${this.clipIdx}_`;
      const inputs = [];
      for (let i = 0; i < bufferArr.length; i++) {
        const buffer = bufferArr[i];
        const ii = `${i}`.padStart(5, 0);
        const filename = `${prefix}${ii}.${this.opts.format}`;
        inputs.push(filename);
        const data = buffer instanceof ImageData ? buffer.data : 
                      new Uint8Array(buffer, 0, buffer.byteLength);
        ffmpeg.FS("writeFile", filename, data);
      }

      // const listDir = ffmpeg.FS('readdir', '/');
      // console.log('read dir', listDir);

      let formatCmds = [];
      // if (this.opts.format === 'bmp') {
      //   const pixel_format = 'rgba';
      //   const video_size = `${this.player.width}x${this.player.height}`;
      //   formatCmds = [
      //     '-s', video_size, '-vcodec', 'rawvideo', 
      //     '-pixel_format', pixel_format, '-video_size', video_size
      //   ];
      // }

      const cmds = [
        "-framerate", `${fps}`, "-pattern_type", "glob", 
        ...formatCmds,
        "-i", `${prefix}*.${this.opts.format}`,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", 
        '-profile:v', 'main', // profile:v - main profile: mainstream image quality. Provide I / P / B frames
        '-preset', this.opts.preset, // preset - compromised encoding speed
        '-crf', this.opts.crf, // crf - The range of quantization ratio is 0 ~ 51, where 0 is lossless mode, 23 is the default value, 51 may be the worst
        '-movflags', 'faststart',
        out];
      await ffmpeg.run(...cmds);

      for (const filename of inputs) {
        ffmpeg.FS("unlink", filename);
      }

      // console.log('burn clip', this.clipIdx, totalClip, this.clipIdx / totalClip, performance.now() - ss);
      this._clipProg = this.clipIdx / totalClip;
      this.updateProgress();

      // const _output = ffmpeg.FS("readFile", out);
      // const _url = URL.createObjectURL(new Blob([_output.buffer], { type: "video/mp4" }));
      // this.debugShowVideo(_url);

      if (this.opts.useSingleThread) {
        // A walkround for reuse bug: https://github.com/ffmpegwasm/ffmpeg.wasm/issues/330
        this.clips.push({ file: out, data: ffmpeg.FS("readFile", out) });
        // const ss = Date.now();
        await ffmpeg.exit();
        await ffmpeg.load();
        // console.log('reload ffmpeg', Date.now() - ss);
      }

      if (this.burning && !this.extracting && !this.extractEnded
         && this.clipBurnQueue.queue.length < this.opts.maxQueueLen) {
        // restart extract
        // console.log('restart extract', this.clipBurnQueue.queue.length);
        this.extract();
      }
    });
  }

  concatClip() {
    this.clipBurnQueue.enqueue(async () => {
      const { ffmpeg } = this;
      if (!ffmpeg.isLoaded()) return;

      let files = [];
      if (this.opts.useSingleThread) {
        for (const { file, data } of this.clips) {
          ffmpeg.FS('writeFile', file, data);
          files.push(file);
        }
      } else {
        const listDir = ffmpeg.FS('readdir', '/');
        files = listDir.filter(x => x.startsWith('clip') && x.endsWith('mp4'));
      }
      const concats = files.map(file => `file '${file}'`).join("\n");
      ffmpeg.FS('writeFile', 'concat_list.txt', concats);

      // Todo: audio只能在最后拼，否则每个clip之间会有一帧是没有声音的
      const audio = AudioUtil.encodeWAV(this.audioData, 3, this.player.audioSampleRate, 2, 32);
      const ab = new DataView(audio).buffer;
      ffmpeg.FS("writeFile", 'audio.wav', new Uint8Array(ab, 0, ab.byteLength));

      // const _url = URL.createObjectURL(new Blob([new DataView(audio)], { type: "audio/wav" }));
      // this.debugShowVideo(_url);
      // return;

      ffmpeg.setLogger(({ type, message }) => {
        if (!message) return;
        const res = message.match(/time=\s*([\d\:\.]+)\s*bitrate=[\s\d.]+kbits\/s\s*speed=/);
        if (res && res[1]) {
          const total = (this.opts.clipSize * files.length) / fps;
          // console.log('concat progress', out, res[1], total);
        } else {
          // console.log({type, message});
        }
      });

      const out = `out.mp4`;
      const cmds = ['-f', 'concat', '-safe', '0', 
        '-i', 'concat_list.txt', 
        '-i', 'audio.wav', 
        "-c:v", "copy", // 必须要，否则很慢
        out];
      await ffmpeg.run(...cmds);
      this.onProgress && this.onProgress(0.99);

      for (const filename of files) {
        ffmpeg.FS("unlink", filename);
      }
      ffmpeg.FS("unlink", 'audio.wav');

      this.burning = false;
      const qt = (Date.now() - this.burnStart) * 0.001;
      const output = ffmpeg.FS("readFile", out);
      const url = URL.createObjectURL(new Blob([output.buffer], { type: "video/mp4" }));
      this.emit('done', { id: this.jobId , output: url, qt });
      console.log('burn done', { id: this.jobId , output: url, qt });

      // reset
      this.clips = null;
      this.clipIdx = null;
      this.audioData = null;
      this.audioCursor = null;
      this.onProgress = null;
      await ffmpeg.exit();
      await ffmpeg.load();
    });
  }

  debugShowVideo(url, appendId=true) {
    const video = document.createElement('video');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('crossOrigin', 'Anonymous'); // 必须设置，不然可能*污染*canvas
    video.setAttribute('controls', ''); // show controls
    video.preload = 'auto';
    video.autoload = true;
    video.src = url;
    // video.muted = true;
    video.width = 300;
    video.height = 300;
    if (typeof(appendId) === 'string' && document.getElementById(appendId)) {
      document.getElementById(appendId).append(video);
    } else if (appendId) {
      document.body.append(video);
    }
    return video;
  }

  async cancel() {
    if (!this.burning) return;
    this.cancelled = true;
    this.emit('done', { id: this.jobId , output: null });
    if (this.ffmpeg) await this.ffmpeg.exit();
    this.extractQueue.destroy();
    this.extractQueue = new Queue();
    this.clipBurnQueue.destroy();
    this.clipBurnQueue = new Queue();
    this.audioData = null;
    this.clips = null;
    this.onProgress = null;
    this.burning = false;
  }

  async destroy() {
    this.cancel();
    this.player = null;
    this.opts = null;
    this.extractQueue = null;
    this.clipBurnQueue = null;
    this.ffmpeg = null;
  }
}

export default Burner;