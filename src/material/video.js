import { settings } from "pixi.js";
import ImageMaterial from "./image";
import Queue from "../util/queue";
import Utils from "../util/utils";
import VideoSource from "../util/video-source";
import STATIC from "../core/static";

const CACHE_FRAMES = 30;

class VideoMaterial extends ImageMaterial {

  async init(onprogress) {
    this.frames = [];
    this.muted = true;
    this.playing = false;
    this.perpared = false;
    this.queue = new Queue();

    // todo: use audio decoder
    // await this.loadAudioBuffer((p) => {
    //   onprogress && onprogress(p * 0.9);
    // });

    this.videoSource = await VideoSource.get(this.src, this.player);
    this.info = await this.videoSource.loadmeta();
    this.ticker = 1 / this.info.fps;
    console.log('meta', this.node.id, this.info);

    this.canvas = this.createCanvas();
    onprogress && onprogress(1.0);

    // debug
    // this.canvas.setAttribute('data-id', this.node.id);
    // this.canvas.setAttribute('style', "width:120px;height:60px;border:1px solid #CCC;");
    // document.body.append(this.canvas);
  }

  async prepare(nodeTime, type) {
    if (this.perpared) return;
    this.perpared = true;
    const { time, loops, overflow } = this.matTime(nodeTime);
    this.extract(time);
  }

  velease(type) { }

  pause() {
    this.perpared = false;
  }

  async getFrame(matTime, retried=0) {
    matTime = Math.max(0, Math.min(matTime, this.info.lastFrame));
    let i = 0;
    // 半帧以内，就四舍五入了
    const mtime = matTime - (this.ticker / 2);
    for (; i < this.frames.length; i++) {
      const frame = this.frames[i];
      if (frame.t < mtime) this.closeFrame(frame, 'rollover');
      else break;
    }

    const frame = this.frames[i];
    // 可以接受1-2帧的误差，因为有些视频会缺帧
    if (frame && Math.abs(frame.t - matTime) < this.ticker * 3) {
      this.frames.splice(0, i);
      if (this.frames.length < CACHE_FRAMES) {
        const lastTime = this.frames[this.frames.length - 1].t;
        if (lastTime < this.info.lastFrame) this.extract(lastTime);
      }
      return frame;
    }

    if (retried > 0) return; // 避免递归死循环
    this.frames.map(f => this.closeFrame(f, `clean ${matTime}`));
    this.frames = [];
    let tried = 0;
    if (this.extracting) { // 之前的prepare正在进行中
      while (this.extracting && tried++ < 300) await Utils.sleep(10 + tried);
    } else if (!await this.extract(matTime)) {
      return; // extract失败，返回空
    }

    // extract成功，再getFrame一次
    return await this.getFrame(matTime, ++retried);
  }

  closeFrame(frame, note) {
    frame.data.close();
    frame.note = note;
  }

  async extract(matTime) {
    // todo: 考虑转场补帧的情况下，不在时间轴内的都不需要
    if (this.extracting || matTime > this.getEndOffset(true)) return;
    this.extracting = true;
    const ss = performance.now();
    // console.log('extract start', matTime);
    const duration = CACHE_FRAMES / this.player.fps;
    const frames = await this.videoSource.extract('video', matTime, matTime + duration);
    if (!frames) return;
    let append = false;
    for (let i in this.frames) {
      if (this.frames[i].t >= frames[0].t) {
        const replaced = this.frames.splice(i, this.frames.length - i, ...frames);
        if (replaced.length) replaced.map(f => this.closeFrame(f, 'replace'));
        append = true;
        break;
      }
    }
    if (!append) {
      this.frames.map(f => this.closeFrame(f, 'refresh'));
      this.frames = frames;
    }
    // console.log('extract done', matTime, performance.now() - ss, 'frames:', this.frames.length);
    this.extracting = false;
    return true
  }

  async render(nodeTime, type, view) {
    const { time, loops, overflow } = this.matTime(nodeTime);
    let playing = (type === STATIC.VIEW_TYPE_PLAY && !overflow);
    if (loops != this.loops) {
      this.loops = loops;
      // todo...
      // if (play) await this.queuedSeekTo(time, K_PLAYER);
    }

    const frame = await this.getFrame(time);
    try {
      if (!frame) throw new Error('no frame!');
      const ctx = this.canvas.getContext('2d');
      const { blur, width, height } = this;
      if (blur > 0) ctx.filter = `blur(${blur}px)`;
      const ss = performance.now();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frame.data, 0, 0, width, height);
      view.source = this.canvas;
    } catch (e) {
      console.error(e);
      // console.log('error!', this.node.id, nodeTime, time, frame);
    }
    // const lag = frame ? (frame.t - time).toFixed(3) : 'none';
    // const pool = this.frames.length;
    // console.log('!!frame', nodeTime.toFixed(3), time.toFixed(3), { lag, pool });
  }

  async getAudioFrame(nodeTime, frameSize) {
    if (this.audioBuffer) return super.getAudioFrame(nodeTime, frameSize);
    if (!this.info || this.info.numberOfChannels <= 0) return null;
    // todo: 没有处理变速的问题！！
    const { time, loops, overflow } = this.matTime(nodeTime);
    const { audioSampleRate, numberOfChannels, audioContext } = this.player;
    const start = this.audioCache && this.audioCache.start ?
       Math.round((time - this.audioCache.start) * audioSampleRate) : -1;

    if (start < 0 || start + frameSize > this.audioCache.length) {
      // const ss = performance.now();
      const res = await this.videoSource.extract('audio', time, time + 1);

      let data = [], start, duration, matSampleRate;
      for (const ch of res) {
        start = ch.t;
        matSampleRate = ch.sampleRate;
        const chData = new Float32Array(ch.data);
        duration = chData.length / matSampleRate;
        data.push(chData);
      }

      if (audioSampleRate !== matSampleRate) { // resample to audioSampleRate
        const ctx = new OfflineAudioContext(numberOfChannels, audioSampleRate * duration, audioSampleRate);
        const source = ctx.createBufferSource();
        const buffer = audioContext.createBuffer(numberOfChannels, data[0].length, matSampleRate);
        for (let c = 0; c < numberOfChannels; c++) {
          buffer.getChannelData(c).set(data[c]);
        }
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        const resampledBuffer = await ctx.startRendering();
        data = [];
        for (let c = 0; c < numberOfChannels; c++) {
          data.push(resampledBuffer.getChannelData(c));
        }
      }

      this.audioCache = { start, length: data[0].length, data };
      // console.log(`audio cache ${matSampleRate}=>${audioSampleRate}`, nodeTime, this.audioCache.length, performance.now() - ss);
    }

    const buffer = audioContext.createBuffer(numberOfChannels, frameSize, audioSampleRate);
    for (let c = 0; c < numberOfChannels; c++) {
      buffer.getChannelData(c).set(this.audioCache.data[c].slice(start, start + frameSize));
    }
    return buffer;
  }

  destroy() {
    super.destroy();
    if (this.queue) this.queue.destroy();
    this.queue = null;
    if (this.frames) this.frames.map(f => this.closeFrame(f, 'destroy'));
    this.frames = null;
  }
}

export default VideoMaterial;