import EventEmitter from "eventemitter3";
import Queue from '../util/queue';
import XhrUtil from '../util/xhr';
import AudioUtil from '../util/audio';
import Utils from '../util/utils';

let WORKER_CODE = 'let MP4Box = {}, _;';
const mbi = require.resolve('mp4box');
WORKER_CODE += '(' + __webpack_modules__[mbi].toString() + ')(_, MP4Box);\n';
const vdi = require.resolve('../util/video-encoder.js');
WORKER_CODE += '(' + __webpack_modules__[vdi].toString() + ')()';
const WORKER_URL = URL.createObjectURL(new Blob([WORKER_CODE]));

const DEFAULT_OPTS = {
  quanlity: 'default' // default | high | low
};

class Burner extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = {...DEFAULT_OPTS, ...opts};
    this.burning = false;
  }

  async export(player, progress=()=>{}) {
    if (this.burning) return false;
    if (!player || !player.duration) {
      console.log('Player not ready!');
      return false;
    }

    player.lock();
    this.jobId = Utils.genUuid();
    this.queue = new Queue();
    this.emit('start', { id: this.jobId });

    this.burning = true;
    this.cancelled = false;

    const burnStart = performance.now();
    const { quanlity, fps: burnFPS, size } = this.opts;

    let _fps, _width, _height;
    // set fps
    if (!isNaN(burnFPS) && burnFPS >= 10 && burnFPS <= 60) {
      _fps = player.fps;
      player.fps = burnFPS;
    }

    // resize
    if (size && size?.width > 0 && size?.height > 0
       && size.width !== player.width && size.height !== player.height
       && Math.abs((size.width / size.height) - (player.width / player.height)) < 0.01) {
      _width = player.width;
      _height = player.height;
      await player.resize(size.width, size.height);
    }

    const { audioSampleRate, numberOfChannels, width, height, duration, fps } = player;

    this.worker = new Worker(WORKER_URL);
    await this.workerExec({
      method: 'init', quanlity, // bitrate,
      fps, width, height, duration,
      audioSampleRate, numberOfChannels,
    });

    const totalFrames = Math.ceil(duration * fps);
    let i = 0, timer = 0, audioCursor = 0;
    let vEncodePromise = { res: true }, aEncodePromise = { res: true };
    while (i < totalFrames) {
      if (this.cancelled) break;
      const timer = i / fps;

      // video
      const vPromise = player.getFrameImageData(timer, { format: 'bitmap' });

      // audio todo: size应该是1024的倍数？
      const size = Math.round(Math.min(duration, (i + 1) / fps) * audioSampleRate) - (audioCursor / 2);
      const aPromise = size ? player.getFrameAudioData(timer, { size }) : null;

      const [imageBitmap, audioBuffer,  vEncode,        aEncode] = await Promise.all([
             vPromise,    aPromise,     vEncodePromise, aEncodePromise]);
      if (this.cancelled) break;

      if (!vEncode?.res || !aEncode?.res) {
        this.cancel();
        break;
      }

      // todo: 在video/image切换的时候，设置kf，提前计算好
      const keyFrame = i % fps === 0;
      // flush，避免encoder的队列堆积占用内存过大
      const flush = i > 0 && keyFrame;
      const timestamp = Math.round(1000000 * timer);

      vEncodePromise = this.workerExec({
        method: 'encode', type: 'video',
        flush, timestamp, keyFrame, buffer: imageBitmap
      }, [imageBitmap]);

      if (audioBuffer) {
        const planarData = new Float32Array(audioBuffer.length * numberOfChannels);
        for (let c = 0; c < numberOfChannels; c++) {
          planarData.set(audioBuffer.getChannelData(c), c * audioBuffer.length);
        }
        const aBuffer = planarData.buffer;
        aEncodePromise = this.workerExec({
          method: 'encode', type: 'audio',
          timestamp, samples: audioBuffer.length, buffer: aBuffer
        }, [aBuffer]);
        audioCursor += audioBuffer.length * 2;
      }

      i ++;
      const cost = (performance.now() - burnStart) * 0.001;
      const sx = timer / cost;
      const prog = Math.min(0.96, 0.96 * (timer / duration));
      progress && progress(prog);
      if (i % fps === 0) {
        player.log('burning', `${(prog * 100).toFixed(2)}%`, `${sx.toFixed(2)}x`);
      }
    }

    // reverse fps, size...
    if (_fps) player.fps = _fps;
    if (_width && _height) await player.resize(_width, _height);

    player.unlock();
    if (this.cancelled) return;
    const { buffer } = await this.workerExec({ method: 'flush' });
    progress && progress(0.99);

    if (!buffer) return this.cancel();
    const qt = (performance.now() - burnStart) * 0.001;
    const url = URL.createObjectURL(new Blob([buffer], { type: "video/mp4" }));
    const filesize = `${(buffer.byteLength / (1024 ** 2)).toFixed(2)} MiB`;
    const sx = duration / qt;
    const res = { 
      id: this.jobId, url, qt, speed: sx, size: filesize, 
      byteLength: buffer.byteLength
    };
    this.emit('done', res);
    player.log('burn done!', `frames: ${i}`, `speed: ${sx.toFixed(2)}x`, `size: ${filesize}`);

    // clean up
    this.worker.terminate();
    this.worker = null;
    this.burning = false;
    return res;
  }

  annotateKeyFrames(player) {
    const kfs = [];
    player.rootNode.allNodes.map((node) => {
      if (!['image', 'video'].includes(node.type)) return;
    });
  }

  async workerExec(data, buffer) {
    if (!this.queue) {
      this.cancel();
      return {};
    }
    return this.queue.enqueue(async () => {
      return new Promise((resolve, reject) => {
        const reqId = Utils.genUuid();
        this.worker.addEventListener('message', e => {
          if (e.data.reqId === reqId) resolve(e.data);
        }, { once: true });
        this.worker.postMessage({reqId, ...data}, buffer);
      });
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
    this.burning = false;
  }

  async destroy() {
    this.removeAllListeners();
    this.cancel();
    if (this.queue) this.queue.destroy();
    this.queue = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.opts = null;
  }
}

export default Burner;