import md5 from 'md5';
import { settings } from "pixi.js";
import Utils from "./utils";
import Queue from "./queue";

const VQ = new Queue();
const VPOOL = { };
if (global) global.PIXIPLY_VSPOOL = VPOOL;

let WORKER_CODE = 'let MP4Box = {}, _;';
const mpi = require.resolve('mp4box');
WORKER_CODE += '(' + __webpack_modules__[mpi].toString() + ')(_, MP4Box);';
const vdi = require.resolve('./video-worker.js');
WORKER_CODE += '(' + __webpack_modules__[vdi].toString() + ')()';
const WORKER_URL = URL.createObjectURL(new Blob([WORKER_CODE]));

class VideoSource  {
  constructor(url) {
    this.id = Utils.genUuid();
    this.url = url;
    this.meta = null;
    this._metacallbacks = [];
    this.queue = new Queue();

    this.worker = new Worker(WORKER_URL); //'./dist/video-decoder.js'
    this.worker.addEventListener('message', e => {
      if (e.data.method === 'ready') {
        this.meta = e.data.meta;
        this._metacallbacks.map(c => c.resolve(this.meta));
        this._metacallbacks = [];
      }
    }, { once: true });
    this.worker.postMessage({ method: 'init', url });
  }

  async loadmeta() {
    if (this.meta) return this.meta;
    // todo: timeout
    return new Promise((resolve, reject) => {
      this._metacallbacks.push({resolve, reject});
    });
  }

  async extract(start, end) {
    return this.queue.enqueue(async () => {
      return new Promise((resolve, reject) => {
        this.worker.addEventListener('message', e => {
          if (e.data.method === 'extract') resolve(e.data.frames);
        }, { once: true });
        this.worker.postMessage({ method: 'extract', start, end });
      });
    });
  }

  destroy() {
    if (this.queue) this.queue.destroy();
    this.queue = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    if (this._metacallbacks) this._metacallbacks.map(c => c.resolve());
    this._metacallbacks = null;
    this.meta = null;
  }

  static clear(cid) {
    if (!VPOOL[cid] || !Array.isArray(VPOOL[cid])) return;
    VPOOL[cid].map(vs => vs.destroy());
    VPOOL[cid] = null;
  }

  static get(url, cid) {
    return VQ.enqueue(async () => { // 用Queue避免并发导致重复
      if (!VPOOL[cid]) VPOOL[cid] = {};
      const key = md5(url);
      if (!VPOOL[cid][key]) {
        VPOOL[cid][key] = new VideoSource(url);
      }
      return VPOOL[cid][key];
    });
  }
}

export default VideoSource;