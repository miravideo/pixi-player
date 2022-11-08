import { settings } from "pixi.js";
import ImageMaterial from "./image";
import Queue from "../util/queue";
import VideoHolder from "../util/video";
import STATIC from "../core/static";

const K_PLAYER = 'player';
const K_SEEKER = 'seeker';
const K_INIT = 'init';
const ADJ_STEP = 0.02;

class VideoMaterial extends ImageMaterial {

  async init(onprogress) {
    this.muted = true;
    this.playing = false;
    this.perpared = false;
    this.queue = new Queue();
    this.$vh = {};
    await this.loadAudioBuffer((p) => {
      onprogress && onprogress(p * 0.9);
    });

    const key = K_PLAYER; // K_INIT
    const vh = await this.valloc(key);
    if (!vh) return;
    this.info = await vh.getInfo();
    if (!this.info) return;
    this.velease(key); // 拿完之后就释放

    this.canvas = this.createCanvas();

    onprogress && onprogress(1.0);
    // debug
    // this.canvas.setAttribute('data-id', this.node.id);
    // this.canvas.setAttribute('style', "width:120px;height:60px;border:1px solid #CCC;");
    // document.body.append(this.canvas);
  }

  get holderId() {
    return this.node.id;
  }

  async valloc(key) {
    if (!this.player) return;
    if (this.$vh[key]) return this.$vh[key];
    const url = this.src;
    try {
      this.$vh[key] = await VideoHolder.get(url, this.player.id, `${this.holderId}-${key}`);
    } catch (e) {
      console.error(e);
      return null;
    }
    if (this.destroied) return;
    const vh = this.$vh[key];
    if (!vh.loaded) {
      // this.player.log('wait info..', vh.id, vh.url);
      await vh.getInfo();
      // this.player.log('get info!!!', vh.id, vh.url);
    }
    if (this.destroied) return;
    return vh;
  }

  velease(key) {
    if (!this.$vh[key]) return;
    this.$vh[key].release(); // 暂停后就释放
    this.$vh[key] = null;
    // console.log('velease', this.holderId, key);
  }

  async play(matTime) {
    // this.player.log('play', this.playing, this.playLock);
    if (this.playing || this.playLock) {
      const _vh = await this.valloc(K_PLAYER);
      // if (_vh?.video && _vh.video.muted != this.muted) {
      //   _vh.video.muted = this.muted;
      // } 
      return;
    }
    this.playLock = true;
    // const ss = Date.now();
    const vh = await this.valloc(K_PLAYER);
    // console.log('play valloc', this.node.id, this.$vh[K_PLAYER].id, Date.now() - ss);
    const $video = vh.video;
    $video.currentTime = matTime;
    $video.playbackRate = this.playrate;
    return new Promise(resolve => {
      if (VideoMaterial.playing($video)) {
        resolve();
        this.playing = true;
        this.playLock = false;
      } else {
        // !!! 本来应该用playing, 但iOS的safari不会触发这个事件, 会导致卡死
        $video.addEventListener('playing', (e) => { // timeupdate
          resolve();
          // console.log('play', this.node.id, this.$vh[K_PLAYER].id, Date.now() - ss);
          this.playing = true;
          this.playLock = false;
        }, { once: true });
        $video.play();
      }
    });
  }

  pause() {
    if (!this.playing) return;
    this.playerDelay = 0;
    const $video = this.$vh[K_PLAYER]?.video;
    const clear = () => {
      this.playing = false;
      this.perpared = false;
      this.velease(K_PLAYER); // 暂停后就释放
    }
    if (!$video || !VideoMaterial.playing($video)) {
      clear();
    } else {
      // $video.addEventListener('pause', (e) => clear(), { once: true });
      $video.pause();
      // console.log('pause', this.node.id, this.$vh[K_PLAYER].id);
      clear(); // todo: 好像会有什么问题
    }
  }

  async prepare(nodeTime) {
    if (this.perpared) return;
    this.perpared = true;
    const { video: $video } = await this.valloc(K_PLAYER);
    if (!$video) return;
    const { time, overflow } = this.matTime(nodeTime);
    $video.currentTime = time;
    // $video.play();
    // setTimeout(() => {
    //   $video.pause();
    // }, 100);
    // console.log('perpared', this.holderId, nodeTime);
  }

  async seekTo(matTime, key=K_SEEKER) {
    return new Promise(async (resolve, reject) => {
      const vh = await this.valloc(key);
      if (!vh) return resolve();
      this.playerDelay = 0;
      const { video: $video } = vh;
      // console.log('alloc!!!', this.holderId, this.$vh[K_SEEKER].id);
      if ($video.currentTime.toFixed(2) == matTime.toFixed(2)) {
        resolve($video);
      } else {
        // !!! 本来应该用seeked, 但iOS的safari不会触发这个事件, 会导致卡死
        let timeout = null;
        const removeListener = (lster) => {
          // $video.removeEventListener('timeupdate', lster);
          $video.removeEventListener('seeked', lster);
        }
        const listener = (e) => {
          if (Math.abs($video.currentTime - matTime) > 0.001) return;
          setTimeout(() => {
            resolve($video);
            removeListener(listener);
          }, 0); // 100ms, 主要是为了确保视频seek之后的图像渲染上去
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
        };
        // $video.addEventListener('timeupdate', listener);
        $video.addEventListener('seeked', listener);
        $video.currentTime = matTime;
        timeout = setTimeout(() => {
          resolve($video);
          removeListener(listener);
          timeout = null;
        }, 10 * 1000); // 10s timeout
      }
    });
  }

  async queuedSeekTo(matTime, key=K_SEEKER) {
    return new Promise(async (resolve, reject) => {
      this.queue.enqueue(async () => {
        resolve(await this.seekTo(matTime, key));
      });
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

    playing ? await this.play(time) : this.pause();
    return new Promise(async (resolve, reject) => {
      // todo: 如果浏览器状态，播放过程中停止了(loading卡住)，这里需要有事件响应
      let $video;
      if (playing) {
        $video = this.$vh[K_PLAYER]?.$video;
        if (!$video) return resolve();
        this.playerDelay = time - $video.currentTime;
        if (this.blur > 0) {
          view.source = this.drawCanvas($video);
        } else {
          // 直接改source，比转绘到canvas上更高效
          view.source = $video;
        }
      } else {
        const key = type.startsWith(STATIC.VIEW_TYPE_BURN) ? type : K_PLAYER;
        $video = await this.queuedSeekTo(time, key);
        if (!$video) return resolve();
        if (this.blur > 0) {
          // 避免模糊后的黑边,  TODO: this.node.getConf('blurEdgeFix') ??
          this.drawCanvas($video, null, true);
        }
        // 转绘到canvas上，避免video被其他拿去用了
        view.source = this.drawCanvas($video);
        // 烧制的时候，会在node结束后再释放，避免重复申请&释放
        if (key === K_PLAYER) this.velease(key);
        // console.log('seeked', this.node.id, type, $video.getAttribute('data-id'), $video.currentTime);
      }
      resolve();
    });
  }

  destroy() {
    super.destroy();
    if (this.queue) this.queue.destroy();
    this.queue = null;
    if (this.$vh) Object.keys(this.$vh).map(k => this.velease(k));
    this.$vh = {};
  }
}

export default VideoMaterial;