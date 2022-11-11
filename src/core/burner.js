import EventEmitter from "eventemitter3";
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import loadMP4Module, { isWebCodecsSupported } from "mp4-wasm";
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
  preset: 'faster', crf: 23, format: FORMAT,
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
    this.ffmpegConfig = _config;

    const mwUrl = 'https://cos.mirav.cn/player/mp4.wasm';
    const mp4wasm = await XhrUtil.getCachedURL(mwUrl, 'burner', (p) => {
      console.log('load mw', p);
    });
    this.mp4wasm = await loadMP4Module({
      getWasmPath: (path, dir, simd) => {
        return mp4wasm.url;
      }
    });

    this.emit('ready');
    progress && progress(1.0);
  }

  get ready() {
    return this.ffmpeg && this.ffmpeg.isLoaded();
  }

  async start(player, progress=()=>{}) {
    if (this.burning) return false;
    if (!player || !player.duration) {
      console.log('Player not ready!');
      return false;
    }

    progress && progress(0.001);

    // ffmpeg load
    const ffmpeg = createFFmpeg({ 
      log: false,
      ...this.ffmpegConfig,
    });

    // start load
    await ffmpeg.load();
    progress && progress(0.05);

    this.jobId = Utils.genUuid();
    this.emit('start', { id: this.jobId });

    this.burning = true;
    this.cancelled = false;

    const burnStart = performance.now();
    const { audioSampleRate, width, height, duration, fps } = player;
    const { speed, crf } = this.opts;

    const videoEncoder = this.mp4wasm.createWebCodecsEncoder({
      width, height, fps,
      acceleration: 'prefer-hardware',
      groupOfPictures: 1024, // just a large number
      codec: 'avc1.640834',
      bitrate: Math.round(width * height * fps * 0.02),
    });

    const tick = 1 / fps;
    let timer = 0, audioCursor = 0;
    let videoBurnRes = null;
    // for audio
    const audioData = new Float32Array(Math.round(2 * duration * audioSampleRate));
    while (true) {
      if (timer > duration || this.cancelled) break;

      // video
      const imgPromise = player.getFrameImageData(timer, { format: 'bitmap' });

      // audio
      const size = Math.min(audioData.length / 2, Math.round((timer + tick) * audioSampleRate)) - (audioCursor / 2);
      const audioPromise = size ? player.getFrameAudioData(timer, { size }) : null;

      const [imageBitmap, audioBuffer, _] = await Promise.all([imgPromise, audioPromise, videoBurnRes]);
      if (this.cancelled) break;

      videoBurnRes = videoEncoder.addFrame(imageBitmap);
      imageBitmap.close();

      if (audioBuffer) {
        const _adata = AudioUtil.interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
        // console.log('set audio', timer, audioCursor, size, audioCursor / audioData.length);
        audioData.set(_adata, audioCursor);
        audioCursor += _adata.length;
      }

      timer += tick;

      const cost = (performance.now() - burnStart) * 0.001;
      const sx = timer / cost;
      const prog = 0.05 + (0.9 * (timer / duration));
      progress && progress(prog);
      // console.log('burning', (prog * 100).toFixed(2), `${sx.toFixed(2)}x`);
    }

    const video = await videoEncoder.end();
    ffmpeg.FS('writeFile', 'video.mp4', video);

    // debug
    this.debugShowVideo(URL.createObjectURL(new Blob([video], { type: "video/mp4" })));

    const audio = AudioUtil.encodeWAV(audioData, 3, audioSampleRate, 2, 32);
    const ab = new DataView(audio).buffer;
    ffmpeg.FS("writeFile", 'audio.wav', new Uint8Array(ab, 0, ab.byteLength));

    ffmpeg.setLogger(({ type, message }) => {
      if (!message) return;
      const res = message.match(/time=\s*([\d\:\.]+)\s*bitrate=[\s\d.]+kbits\/s\s*speed=/);
      if (res && res[1]) {
        const comp = hmsToSeconds(res[1]);
        progress && progress(0.95 + 0.04 * (comp / duration));
        console.log('ffmpeg progress', res[1], comp);
      } else {
        // console.log({type, message});
      }
    });

    const out = `out.mp4`;
    const cmds = [
      '-i', 'video.mp4', 
      '-i', 'audio.wav', 
      "-c:v", "copy", // 必须要，否则很慢
      out];
    await ffmpeg.run(...cmds);
    progress && progress(0.99);

    this.burning = false;
    const qt = (performance.now() - burnStart) * 0.001;
    const output = ffmpeg.FS("readFile", out);
    const url = URL.createObjectURL(new Blob([output.buffer], { type: "video/mp4" }));
    const size = `${(output.length / (1024 ** 2)).toFixed(2)} MiB`;
    const sx = duration / qt;
    this.emit('done', { id: this.jobId , output: url, qt, speed: sx, size });
    console.log('done', `${sx.toFixed(2)}x`, size);

    ffmpeg.FS("unlink", 'video.mp4');
    ffmpeg.FS("unlink", 'audio.wav');
    ffmpeg.FS("unlink", out);

    this.burning = false;
    ffmpeg.exit();

    return url;
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
    this.burning = false;
  }

  async destroy() {
    this.cancel();
    this.opts = null;
  }
}

export default Burner;