import { settings } from "pixi.js";
import ImageMaterial from "./image";
import Queue from "../util/queue";
import VideoHolder from "../util/video";
import Utils from "../util/utils";
import STATIC from "../core/static";

const K_PLAYER = 'player';
const K_SEEKER = 'seeker';
const K_INIT = 'init';

const P_TIME = [ -0.1, 2 ];
const WARMUP_FRAMES = 5;

class VideoMaterial extends ImageMaterial {

  async init() {
    this.playing = false;
    this.perpared = false;
    this.queue = new Queue();
    this.$vh = {};

    // 帧数据缓冲
    // matTime时间作为key，单位是ms(int)
    // 暂时存原画幅，以后可以优化为当前时间(考虑帧动画scale)所需的最高画幅的
    // 格式为JPG的0.3精度ArrayBuffer，通过Image渲染，如果渲染速度很慢，就存ImageData/canvas
    // 考虑JPG的解码速度，会提前3帧warmup成<img>标签
    this.frames = {};

    this.src = this.node.getConf('src');
    this.speed = this.node.getConf('speed');
    this.fps = this.node.root().getConf('fps');

    const key = K_PLAYER; // K_INIT
    const vh = await this.valloc(key);
    this.info = await vh.getInfo();
    this.velease(key); // 拿完之后就释放

    this.canvas = this.createCanvas();
    this.canvasContext = this.canvas.getContext('2d');

  }

  get holderId() {
    return this.node.id;
  }

  get playrate() {
    return this.player.playbackRate * this.speed;
  }

  async valloc(key) {
    if (this.$vh[key]) return this.$vh[key];
    const url = this.src;
    try {
      this.$vh[key] = await VideoHolder.get(url, this.player.id, `${this.holderId}-${key}`);
    } catch (e) {
      console.error(e);
      return null;
    }
    const vh = this.$vh[key];
    if (!vh.loaded) {
      // this.player.log('wait info..', vh.id, vh.url);
      await vh.getInfo();
      // this.player.log('get info!!!', vh.id, vh.url);
    }
    return vh;
  }

  velease(key) {
    if (!this.$vh[key]) return;
    this.$vh[key].release(); // 暂停后就释放
    this.$vh[key] = null;
    // console.log('velease', this.holderId, key);
  }

  // async play(matTime) {
  //   // this.player.log('play', this.playing, this.playLock);
  //   if (this.playing || this.playLock) return;
  //   this.playLock = true;
  //   const vh = await this.valloc(K_PLAYER);
  //   const $video = vh.video;
  //   // 时间差在0.1秒内，就不重新seek里，留给adjust
  //   if (Math.abs(matTime - $video.currentTime) > 0.1 || !this.adjust) {
  //     $video.currentTime = matTime;
  //     // console.log('play', this.holderId, matTime);
  //   }

  //   $video.playbackRate = this.playrate;
  //   return new Promise(resolve => {
  //     if (VideoMaterial.playing($video)) {
  //       resolve();
  //       this.playing = true;
  //       this.playLock = false;
  //     } else {
  //       // !!! 本来应该用playing, 但iOS的safari不会触发这个事件, 会导致卡死
  //       $video.addEventListener('playing', (e) => { // timeupdate
  //         resolve();
  //         this.playing = true;
  //         this.playLock = false;
  //       }, { once: true });
  //       $video.play();
  //     }
  //   });
  // }

  pause() {}
  // pause() {
  //   if (!this.playing && !this.perpared) return;
  //   this.playerDelay = 0;
  //   const $video = this.$vh[K_PLAYER]?.video;
  //   const clear = () => {
  //     this.playing = false;
  //     this.perpared = false;
  //     this.velease(K_PLAYER); // 暂停后就释放
  //   }
  //   if (!$video || !VideoMaterial.playing($video)) {
  //     clear();
  //   } else {
  //     // $video.addEventListener('pause', (e) => clear(), { once: true });
  //     $video.pause();
  //     clear(); // todo: 好像会有什么问题
  //   }
  // }

  // async seekTo(matTime, key=K_SEEKER) {
  //   return new Promise(async (resolve, reject) => {
  //     const vh = await this.valloc(key);
  //     if (!vh) return resolve();
  //     this.playerDelay = 0;
  //     const { video: $video, id } = vh;
  //     // console.log('valloc!!!', this.holderId, id);
  //     if ($video.currentTime.toFixed(2) == matTime.toFixed(2)) {
  //       resolve($video);
  //       this.velease(key);
  //     } else {
  //       // !!! 本来应该用seeked, 但iOS的safari不会触发这个事件, 会导致卡死
  //       const evtType = 'timeupdate';// 'timeupdate';
  //       let timeout = null;
  //       const removeListener = (lster) => {
  //         $video.removeEventListener(evtType, lster);
  //       }
  //       const listener = (e) => {
  //         if (Math.abs($video.currentTime - matTime) > 0.001) return;
  //         setTimeout(() => {
  //           resolve($video);
  //           this.velease(key);
  //           removeListener(listener);
  //         }, 0); // 100ms, 主要是为了确保视频seek之后的图像渲染上去
  //         if (timeout) {
  //           clearTimeout(timeout);
  //           timeout = null;
  //         }
  //       };
  //       $video.addEventListener(evtType, listener);
  //       $video.currentTime = matTime;
  //       timeout = setTimeout(() => {
  //         resolve($video);
  //         this.velease(key);
  //         removeListener(listener);
  //         timeout = null;
  //       }, 10 * 1000); // 10s timeout
  //     }
  //   });
  // }

  // async queuedSeekTo(matTime, key=K_SEEKER) {
  //   return new Promise(async (resolve, reject) => {
  //     this.queue.enqueue(async () => {
  //       resolve(await this.seekTo(matTime, key));
  //     });
  //   });
  // }

  roundTimeInMs(time, tickerInMs) {
    return Math.round((time * 1000) / tickerInMs) * tickerInMs;
  }

  get prepareFPS() {
    // todo: 这里可能会根据设备的实际情况决定fps
    return this.player.fps;
  }

  async prepare(nodeTime, type) {
    const { time, overflow } = this.matTime(nodeTime);
    const playing = (type === STATIC.VIEW_TYPE_PLAY && !overflow);
    const { time: startTime } = this.matTime(nodeTime + P_TIME[0]);
    const { time: endTime } = this.matTime(nodeTime + P_TIME[1]);
    const { width, height } = this;
    // const { fps, width, height } = this.player;
    // const { playrate } = this;
    // const targetFPS = fps / playrate;
    const tickerInMs = (1000 / this.prepareFPS) >> 0; // todo: 如果是快速播放，就不需要那么高的fps
    let startInMs = this.roundTimeInMs(startTime, tickerInMs);
    const endInMs = this.roundTimeInMs(endTime, tickerInMs);
    const timeInMs = time * 1000;

    const frames = {};
    for (let t = startInMs; t <= endInMs; t += tickerInMs) {
      frames[t] = true;
    }

    // remove cache frams over the prepare time window
    for (const tInMs of Object.keys(this.frames)) {
      if (tInMs < startInMs || tInMs > endInMs) {
        delete this.frames[tInMs];
        if (frames[tInMs]) delete frames[tInMs];
        continue;
      }

      if (frames[tInMs]) delete frames[tInMs];
      if (tInMs - timeInMs > 0 && tInMs - timeInMs < tickerInMs * WARMUP_FRAMES
         && typeof(this.frames[tInMs]) === 'string') {
        // warm up...
        this.frames[tInMs] = await this.getImageReady(this.frames[tInMs], width, height);
      }
    }

    // current cache fulfilled
    if (Object.keys(frames).length <= 0) return;

    const prepareStartTime = (Math.min(...Object.keys(frames)) - tickerInMs) * 0.001;
    // update end time
    this.prepareEndTime = endTime;
    // console.log('prepareEndTime', this.node.id, this.prepareEndTime);

    if (this.preparing) {
      const $video = this.$vh[K_PLAYER]?.video;
      if ($video && !VideoMaterial.playing($video)) {
        $video.play();
        // console.log('recalled play!!!', this.node.id, $video.currentTime);
      }
      return;
    }

    this.preparing = true;
    const { video: $video, id: vhId } = await this.valloc(K_PLAYER);
    if (!VideoMaterial.playing($video)) {
      this._prepareStartPT = performance.now();
      this._prepareStartMT = prepareStartTime;
      $video.currentTime = prepareStartTime;
      $video.playbackRate = 1.2 * this.playrate;
      $video.play();
      // console.log(`prepare start! ${this.node.id} ${vhId} [${prepareStartTime.toFixed(3)} => ${endTime.toFixed(3)}]`);
    }
    this.capture($video, tickerInMs, startInMs);
  }

  async capture($video, tickerInMs, startInMs) {
    const tInMs = this.roundTimeInMs($video.currentTime, tickerInMs);
    if (!this.frames[tInMs]) {
      if (tInMs > startInMs && !this.frames[tInMs - tickerInMs]) {
        let i;
        for (i = 1; i < 100; i++) {
          if (this.frames[tInMs - (tickerInMs * i)]) break;
        }
        const lastFrame = this.frames[tInMs - (tickerInMs * i)];
        for (i = 1; i < 100; i++) {
          if (this.frames[tInMs - (tickerInMs * i)]) break;
          this.frames[tInMs - (tickerInMs * i)] = lastFrame;
        }
        console.log('miss N frames!', this.node.id, i - 1, tInMs);
      }

      if (!this.captureCanvas) {
        this.captureCanvas = this.createCanvas();
        this.captureCtx = this.captureCanvas.getContext('2d');
      }
      this.captureCtx.drawImage($video, 0, 0);

      // image data
      this.frames[tInMs] = this.captureCtx.getImageData(0, 0, this.width, this.height);

      // jpeg
      this.captureCanvas.toBlob(blob => {
        this.frames[tInMs] = URL.createObjectURL(blob);
        this.prepareTime = $video.currentTime;
      }, 'jpeg', 0.3);

      // console.log('prepared', this.node.id, 'playing', VideoMaterial.playing($video), tInMs, Object.keys(this.frames).length);
    }

    // end prepare
    if ($video.currentTime > this.prepareEndTime) {
      const spd = ($video.currentTime - this._prepareStartMT) / 
        ((performance.now() - this._prepareStartPT) * 0.001);
      // console.log(`prepare paused! ${this.node.id}, speed:${spd.toFixed(2)}x frames:${Object.keys(this.frames).length} vtime:${$video.currentTime.toFixed(3)}`);
      $video.pause();
      if (!this.playing) {
        // todo: release video holder if not playing
        ;
      }
      this.preparing = false;
      return;
    }

    // next
    window.requestAnimationFrame(() => {
      this.capture($video, tickerInMs, startInMs);
    });
  }

  async render(nodeTime, type, view) {
    const { time, loops, overflow } = this.matTime(nodeTime);
    let playing = (type === STATIC.VIEW_TYPE_PLAY && !overflow);
    if (loops != this.loops) {
      this.loops = loops;
      // todo...
      // if (play) await this.queuedSeekTo(time, K_PLAYER);
    }

    // 找到最接近的一帧，如果是play则可以接受一定范围内的卡帧
    const tickerInMs = (1000 / this.prepareFPS) >> 0; // todo: 如果是快速播放，就不需要那么高的fps
    const timeInMs = this.roundTimeInMs(time, tickerInMs);
    let lastTimeInMs = timeInMs;
    let frame = this.frames[lastTimeInMs];

    const { width, height } = this;
    // console.log('render', this.node.id, {time, lastTimeInMs, prepared: this.frames[lastTimeInMs] && true});
    if (frame) {
      if (frame instanceof Image) {
        this.frames[lastTimeInMs] = frame.src; // remove warmup cache
      } else if (typeof(frame) == 'string') {
        frame = await this.getImageReady(frame, width, height);
      }
      view.source = this.drawCanvas(frame, width, height);

    } else {
      // const keys = Object.keys(this.frames);
      // keys.sort();
      if (!this.preparing) {
        this.queue.enqueue(() => this.prepare(nodeTime, type));
      }

      // console.log('缺帧', this.node.id, time);
      for (let i = 0; i < 1000; i++) {
        await Utils.sleep(10);
        if (this.frames[lastTimeInMs]) {
          console.log('halt', this.node.id, i);
          break;
        }
      }
      return await this.render(nodeTime, type, view);
    }

    // if (!this.debugEl) {
    //   this.debugEl = document.createElement('div');
    //   document.body.append(this.debugEl);
    // }
    // const prepareAdv = this.prepareTime - time;
    // const playerDelay = time - (lastTimeInMs * 0.001);
    // const log = `${this.node.id} padv:${prepareAdv.toFixed(3)} delay:${playerDelay.toFixed(3)}`;
    // console.log(log);
    // this.debugEl.innerHTML = log;

    // 提前缓冲
    if (this.queue.length === 0) {
      this.queue.enqueue(() => this.prepare(nodeTime, type));
    }
  }

  async getImageReady(src, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.width = width;
      img.height = height;
      img.src = src;
    });
  }

}

export default VideoMaterial;