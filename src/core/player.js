import EventEmitter from 'eventemitter3';
import { Application, settings, ENV, Renderer, RenderTexture } from "pixi.js";
import Builder from "../core/builder";
import Utils from '../util/utils';
import Queue from '../util/queue';
import CacheUtil from '../util/cache';
import XhrUtil from '../util/xhr';
import AudioUtil from '../util/audio';
import ImageUtils from '../util/image';
// import VideoHolder from '../util/video';
import VideoSource from '../util/video-source';
import STATIC from './static';

const FFT_SIZE = 4096;

import UAParser from 'ua-parser-js';
const BROWSER = new UAParser().getBrowser();
const IS_HTTPS = ('https:' == document.location.protocol || 'localhost' == document.location.hostname) ? true : false;
const SUPPORTED = ['Edge', 'Chrome'].includes(BROWSER.name) && BROWSER.major >= 104 && IS_HTTPS && typeof VideoEncoder !== "undefined";

class Player extends EventEmitter {
  constructor(opts={}) {
    super();
    this.id = Utils.genUuid();
    const { fps=24, playbackRate=1.0, audioSampleRate=44100, numberOfChannels=2, volume=1.0 } = opts;
    this.fps = fps;
    this.playbackRate = playbackRate;
    this.audioSampleRate = audioSampleRate;
    this.numberOfChannels = numberOfChannels;
    this.volume = volume;
    this._timer = 0;
    this.audioAnalyser = new AudioUtil.Analyser(FFT_SIZE);
    this._audioAnalyserCache = {};
    this.lastTime = 0;
  }

  async initMixin(type, node) {
    await node.initMixin(type, Builder.mixin[type]);
  }

  async init({value, rootNode, mixin, backgroundColor, onprogress, useCache, view}) {
    if (!SUPPORTED) {
      let msg = `Could not find VideoEncoder! Please use Chrome (104+)`;
      if (!['Edge', 'Chrome'].includes(BROWSER.name)) {
        msg = `Please open in Edge/Chrome with version 104+`;
      } else if (BROWSER.major < 104) {
        msg = `Browser version(${BROWSER.major}) too old, should 104+`;
      } else if (!IS_HTTPS) {
        msg = `Only work in HTTPS, please change the url.`;
      }
      // for resolution x2
      view.width = view.width * 2;
      view.height = view.height * 2;
      return this.error(view, msg);
    }

    // empty canvas as default
    if (!rootNode && !value) value = '<canvas></canvas>';

    // onprogress
    let cacheRate = 0;
    let progress = 0;
    if (!rootNode && value) {
      cacheRate = 0.1;
      if (mixin) Builder.regMixin(mixin);
      if (useCache) Builder.cacheNode = CacheUtil.cacheNode;
      const loads = {};
      const { node, cachePromise } = Builder.from(value, {}, (p) => {
        loads[p.key] = p;
        let total = 0, loaded = 0;
        for (const pp of Object.values(loads)) {
          total += pp.total;
          loaded += pp.loaded;
        }
        total && onprogress && onprogress(cacheRate * loaded / Math.max(total, 1024 * 1024));
      });
      await cachePromise;
      rootNode = node;
    }

    this.rootNode = rootNode;
    rootNode.player = this; // bind player

    this.audioContext = new AudioContext({sampleRate: this.audioSampleRate});

    this.app = new Application({
      width: this.rootNode.width,
      height: this.rootNode.height,
      backgroundColor: backgroundColor || 0x000000,
      view,
      autoStart: false,
      sharedTicker: false,
      powerPreference: "high-performance",
    });

    // preload
    await this.rootNode.preload();
    // todo: preload有些不能并行，比如多个video是同一个URL的，会重复下载
    // 但可以写复杂一些的queue去并行？
    const allNodes = this.rootNode.allNodes;
    const r = (1 - cacheRate) / allNodes.length;
    let i = 0;
    for (const node of allNodes) {
      i++;
      const baseProgress = cacheRate + r * (i - 1);
      // console.log('preloading', node.id);
      await node.preload((p) => {
        onprogress && onprogress(baseProgress + r * p);
      });
      onprogress && onprogress(cacheRate + r * i);
      // console.log('preloaded', node.id);
    }

    // annotate
    this.rootNode.allNodes.map(node => node.annotate());
    // todo: allNodes需要重新计算，因为可能还有变化
    this.rootNode.annotate();
    this.rootNode.allNodes.map(node => {
      this.log(
        `${node.id.padEnd(20, ' ')}: ` +
        `show:[${node.absStartTime.toFixed(2).padStart(6, ' ')}, ${node.absEndTime.toFixed(2).padStart(6, ' ')})  ` +
        (!isNaN(node.absDrawStartTime) ? `draw:[${node.absDrawStartTime.toFixed(2).padStart(6, ' ')}, ${node.absDrawEndTime.toFixed(2).padStart(6, ' ')})  ` : '') +
        `duration:${node.duration.toFixed(0).padStart(6, ' ')}  ` +
        `zIndex:${(isNaN(node.zIndex) ? -1 : node.zIndex).toFixed(0).padStart(8, ' ')}`
      );
    });

    // add view
    const rootView = this.rootNode.getView(0, STATIC.VIEW_TYPE_SEEK);
    this.app.stage.addChild(rootView);

    // timer update
    this.tickerCallback = async (delta) => {
      if (this.queue.length > 0) return; // 跳一帧
      this.queue.enqueue(async () => {
        const { currentTime, duration, fps } = this;
        const tick = 1 / fps;
        this._timer += this.audioContext.currentTime - this.lastTime;
        this.lastTime = this.audioContext.currentTime;

        if (currentTime < duration) {
          // this.pptimer = this.pptimer || [];
          const _ss = performance.now();
          await this.rootNode.draw(currentTime, STATIC.VIEW_TYPE_PLAY);
          await this.playAudio(this._timer);
          const _tt = performance.now() - _ss;
          this._renderTime.video += _tt;
          if (_tt > 20) {
            console.log('slow frame', currentTime.toFixed(3), ' render time:', _tt.toFixed(1));
          }
          // this.pptimer.push(_tt);
          this.emit('timeupdate', {currentTime, duration});
        } else { // ended
          // console.log(this.pptimer.reduce((a,b) => a+b, 0));
          this.log('render time', JSON.stringify(this._renderTime));
          this.app.stop();
          // 显示最后一帧
          const totalFrames = Math.ceil(duration * fps);
          await this.rootNode.draw((totalFrames - 1) * tick, STATIC.VIEW_TYPE_SEEK);
          this.stopAudio();
          this.emit('timeupdate', {currentTime: duration, duration});
          this.emit('ended');
        }

        // 一定要，不然转场开始时会闪黑一下
        this.app.render();
      });
    };
    const { ticker } = this.app;
    ticker.add(this.tickerCallback);
    ticker.minFPS = this.fps; // set fps=24 to reduce node.draw calls per second
    ticker.maxFPS = this.fps;
    ticker.update(0);

    // init draw
    this.render();

    this.emit('loadedmetadata', {
      duration: this.duration, width: this.width, height: this.height
    });
  }

  async resize(width, height) {
    if (!width || !height || isNaN(width) || isNaN(height) ||
      (width === this.width && height === this.height)) return;
    if (this.playing) this.pause();
    this.app.renderer.resize(width, height);
    this.rootNode.resize(width, height);

    // add view
    this.app.stage.removeChildren();
    const rootView = this.rootNode.getView(this._timer, STATIC.VIEW_TYPE_SEEK);
    this.app.stage.addChild(rootView);

    await this.render(); // 重新render
    this.emit('resize');
  }

  async render() {
    const type = this.playing ? STATIC.VIEW_TYPE_PLAY : STATIC.VIEW_TYPE_SEEK;
    // 不能正好是duration，否则最后一帧渲染不出来
    await this.rootNode.draw(Math.min(this.currentTime, this.duration - 0.001), type);
    this.app.render();
  }

  get currentTime() {
    return this._timer;
  }

  set currentTime(time) {
    this.seekTo(time);
  }

  async seekTo(time) {
    const { playing } = this;
    if (playing) {
      this.app.stop(); // stop
      this.stopAudio();
    }
    this._timer = time;
    this.emit('seeking');
    await this.render();
    this.emit('seeked');
    this.emit('timeupdate', {currentTime: this._timer, duration: this.duration});
    if (playing) this.app.start(); // go
  }

  get playing() {
    return this.app.ticker.started;
  }

  get duration() {
    return this.rootNode ? this.rootNode.duration : 0;
  }

  async play() {
    if (!this.app || this.playing || this.locked) return;
    this._renderTime = { video: 0, audio: 0 };
    this.lastTime = this.audioContext.currentTime;
    if (this.currentTime > this.duration) {
      // reset to start
      this._timer = 0;
    }
    this.app.start();
    this.audioContext.resume();

    this.emit('playing');
    if (!this.played) { // play started the first time
      this.played = true;
      this.emit('play');
    }
  }

  unlock() {
    this.locked = false;
  }

  lock() {
    if (this.locked) return;
    this.pause();
    this.locked = true;
  }

  pause() {
    if (this.locked || !this.app) return;
    this.app.stop();
    this.stopAudio();

    this.render(); // to stop video playing
    this.emit('pause');
  }

  log(...info) {
    console.log(...info);
    if (document.getElementById('player-logs')) {
      document.getElementById('player-logs').innerHTML += `<br /> ${info.join(' ')}`;
    }
  }

  get width() {
    return this.app?.view.width || this._viewWidth;
  }

  get height() {
    return this.app?.view.height || this._viewHeight;
  }

  get queue() {
    if (!this._queue) this._queue = new Queue();
    return this._queue;
  }

  get canvas() {
    return this.app?.view;
  }

  getRenderer(type) {
    return (type === STATIC.VIEW_TYPE_BURN) ? this._burner : this.app.renderer;
  }

  burnerRenderer(width, height) {
    if (this._burner) {
      if (width != this._burner.width || height != this._burner.height) {
        this._burner.resize(width, height);
      }
    } else {
      this._burner = new Renderer({ width, height, powerPreference: "high-performance", });
    }
    return this._burner;
  }

  getNodeById(id) {
    let reg = null;
    if (id.includes('*')) reg = new RegExp(id.replaceAll('*', '.*'));
    const nodes = this.rootNode.allNodes.filter(x => {
      if (reg) return x.id.match(reg);
      else return x.id === id;
    });
    return reg ? nodes : nodes[0];
  }

  async audioAnalyserProcess(time) {
    if (this.audioAnalyser._time === time) return
    if (!this._audioAnalyserCache[time]) {
      this._audioAnalyserCache[time] = new Promise(async (resolve) => {
        // todo 性能优化，搬到webWorker里
        const audioData = await this.getFrameAudioData(time, {size: Math.round(1 / this.fps * this.audioSampleRate)});
        if (audioData) {
          this.audioAnalyser.process([audioData.getChannelData(0), audioData.getChannelData(1)])
          this.audioAnalyser._time = time;
        }
        resolve();
        delete this._audioAnalyserCache[time];
      });
    }
    return this._audioAnalyserCache[time];
  }

  async getFrameAudioData(time, opts={}) {
    let { size } = opts;
    let { audioSampleRate, numberOfChannels, fps } = this;
    size = size || Math.round(audioSampleRate / fps);
    const buffer = this.audioContext.createBuffer(numberOfChannels, size, audioSampleRate);
    const mergedAudioFrame = [];
    for (let c = 0; c < numberOfChannels; c++) {
      mergedAudioFrame.push(buffer.getChannelData(c));
    }

    for (const node of this.rootNode.allNodes) {
      const { volume, audioFrame } = await node.getAudioFrame(time, size);
      if (!volume || !audioFrame || !audioFrame.length) continue;
      for (let c = 0; c < numberOfChannels; c++) {
        const chData = audioFrame.getChannelData(c);
        for (let i = 0; i < size; i++) {
          mergedAudioFrame[c][i] += chData[i] * volume || 0;
        }
      }
    }

    if (Math.abs(this.volume - 1.0) > 0.01) {
      for (let i = 0; i < size; i++) {
        for (let c = 0; c < numberOfChannels; c++) {
          mergedAudioFrame[c][i] = mergedAudioFrame[c][i] * this.volume;
        }
      }
    }

    return buffer;
  }

  async getPreviewImage(node, time, opts={}) {
    if (!this.previewQueue) this.previewQueue = new Queue();
    return this.previewQueue.enqueue(async () => {
      const { width, height } = this;
      const vtype = STATIC.VIEW_TYPE_BURN;
      const burner = this.burnerRenderer(width, height);
      const view = node.getView(vtype);
      await node.draw(time, vtype);
      // directly render to screen and use burner.view will cause interaction event bug.
      // use RenderTexture to avoid it
      const renderTexture = RenderTexture.create({width, height});
      burner.render(view, {renderTexture});
      // todo: extract支持直接出图，就不用再转绘一次了
      const canvas = burner.plugins.extract.canvas(renderTexture);
      // todo: frame of bounds?
      const frame = node.isViewContainer ? 
        { x: 0, y: 0, w: width, h: height } : 
        { x: view.x, y: view.y, w: view.width, h: view.height };
      return ImageUtils.subImage(canvas, frame, opts);
    });
  }

  async getFrameImageData(time, opts={}) {
    const { width: w, height: h } = this;

    // 直接用player来烧，让画面同时动起来，感觉会快一些
    const burner = this.app.renderer;
    await this.rootNode.draw(time, STATIC.VIEW_TYPE_SEEK);
    this.app.render();

    if (opts?.format === 'bitmap') {
      return await createImageBitmap(burner.view);
    }

    const useRaw = opts?.format === 'bmp';
    return new Promise((resolve) => {
      if (useRaw) {
        const canvas = settings.ADAPTER.createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        // 转绘到另一个canvas上, 之后渲染下一帧了
        ctx.drawImage(burner.view, 0, 0, w, h);
        setTimeout(() => { // 避免卡死
          resolve(ctx.getImageData(0, 0, w, h));
        }, 0);
      } else {
        burner.view.toBlob(async (blob) => {
          const ab = await blob.arrayBuffer();
          resolve(ab);
        }, `image/jpeg`, 0.7);
      }
    });
  }

  async playAudio(start) {
    if (this.volume <= 0) return this.stopAudio();
    const ss = performance.now();
    const frames = 20;
    const { numberOfChannels, fps } = this;
    const len = frames / fps;
    // 留25%的安全距离，避免还在播放的部分被替换
    // todo: 但得小心，避免处理时长太长不够
    const delay = (frames * 0.5) / fps;
    if (!this.playingAudioSource) {
      const ab = await this.getAudioBuffer(start, frames * 2);
      if (!this.playing) return this.stopAudio(); // may paused
      const source = this.audioContext.createBufferSource();
      source.buffer = ab;
      source.loop = true;
      source.connect(this.audioContext.destination);
      source.start();
      this.playingAudioSource = source;
      this.playingAudioEnd = start + (len * 2);
      this.updateLastHalf = false;
    } else if (this.playingAudioEnd - start < len - delay && !this.audioPlayUpdating) {
      this.audioPlayUpdating = true;
      // 提前更新，不需要阻塞
      this.getAudioBuffer(this.playingAudioEnd, frames).then(ab => {
        if (!this.playingAudioSource || !this.playing) return this.stopAudio(); // may paused
        const buffer = this.playingAudioSource.buffer;
        const offset = this.updateLastHalf ? buffer.length * 0.5 : 0;
        for (let c = 0; c < numberOfChannels; c++) {
          buffer.getChannelData(c).set(ab.getChannelData(c), offset);
        }
        this.updateLastHalf = !this.updateLastHalf;
        this.playingAudioEnd += len;
        this.audioPlayUpdating = false;
      });
      // const ab = await this.getAudioBuffer(this.playingAudioEnd, frames);
      // for (let c = 0; c < numberOfChannels; c++) {
      //   buffer.getChannelData(c).set(ab.getChannelData(c), offset);
      // }
      // this.updateLastHalf = !this.updateLastHalf;
      // this.playingAudioEnd += len;
    }
    this._renderTime.audio += performance.now() - ss;
  }

  stopAudio() {
    if (this.playingAudioSource) {
      this.playingAudioSource.stop();
      this.playingAudioSource.disconnect();
    }
    this.playingAudioSource = null;
    this.playingAudioEnd = null;
  }

  async getAudioBuffer(time, frames) {
    const { audioSampleRate, numberOfChannels, fps } = this;
    const tick = 1 / fps;
    const len = Math.round(frames * tick * audioSampleRate);
    const buffer = this.audioContext.createBuffer(numberOfChannels, len, audioSampleRate);
    let cursor = 0, timer = time;
    for (let i = 0; i < frames; i++) {
      const size = Math.min(len, Math.round((i + 1) * tick * audioSampleRate)) - cursor;
      const aframe = await this.getFrameAudioData(timer, { size });
      timer += tick;
      for (let c = 0; c < numberOfChannels; c++) {
        buffer.getChannelData(c).set(aframe.getChannelData(c), cursor);
      }
      cursor += aframe.length;
    }
    return buffer;
  }

  debugProf(tag, i) {
    if (!tag) return this._perfStart = performance.now();
    const tt = performance.now() - this._perfStart;
    const speed = (i / this.fps) / (0.001 * tt);
    document.getElementById('time').value = `{${tag}} ${i} ${speed.toFixed(3)}`;
  }

  debugShowImage(i, data) {
    if (i % this.fps !== 0) return;
    let src;
    if (data instanceof ImageData) {
      var _canvas = document.createElement('canvas');
      var _ctx = _canvas.getContext('2d');
      _canvas.width = data.width;
      _canvas.height = data.height;
      _ctx.putImageData(data, 0, 0);
      src = _canvas.toDataURL("image/jpeg", 0.5);
    } else if (data instanceof ImageBitmap) {
      var _canvas = document.createElement('canvas');
      var _ctx = _canvas.getContext('2d');
      _canvas.width = data.width;
      _canvas.height = data.height;
      _ctx.drawImage(data, 0, 0);
      src = _canvas.toDataURL("image/jpeg", 0.5);
    } else if (data instanceof ArrayBuffer) {
      src = URL.createObjectURL(new Blob([data]));
    } else if (data instanceof Blob) {
      src = URL.createObjectURL(data);
    } else if (data.getContext) {
      src = data.toDataURL("image/jpeg", 0.5);
    } else {
      return;
    }
    const img = new Image();
    img.width = 100;
    img.height = 100;
    img.src = src;
    document.getElementById('test-images').append(img);
  }

  toMiraML(asTemplate=true, indent=2) {
    if (!this.rootNode) return;
    return this.rootNode.toMiraML(asTemplate, indent);
  }

  toJson(asTemplate=false) {
    if (!this.rootNode) return;
    return this.rootNode.toJson(asTemplate);
  }

  error(canvas, msg) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fontSize = Math.round(Math.min(canvas.width * 1.5 / Array.from(msg).length, canvas.height/ 5));
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, canvas.width / 2, (canvas.height / 2) + 20);
    ctx.font = `50px Arial`;
    ctx.fillStyle = '#FF0000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', canvas.width / 2, (canvas.height / 2) - 30);
    [this._viewWidth, this._viewHeight] = [canvas.width, canvas.height];
  }

  destroy() {
    // stop
    if (this.app) this.app.stop();
    this.stopAudio();
    this.removeAllListeners();

    if (this.previewQueue) this.previewQueue.destroy();
    this.previewQueue = null;
    if (this._queue) this._queue.destroy();
    this._queue = null;
    if (this.audioContext) this.audioContext.close();
    this.audioContext = null;
    if (this.rootNode) this.rootNode.destroy();
    this.rootNode = null;
    if (this._burner) this._burner.destroy(true);
    this._burner = null;
    if (this.app) this.app.destroy(true);
    this.app = null;

    this.tickerCallback = null;
    XhrUtil.clear(this.id);
    AudioUtil.clear(this.id);
    VideoSource.clear(this.id);
    // VideoHolder.release(this.id);
    if (this.audioAnalyser) {
      this.audioAnalyser.destroy();
      this.audioAnalyser = null;
    }
  }
}

export default Player;