import md5 from 'md5';
import Utils from "./utils";
import Queue from "./queue";

const POOL_DEFAULT = 'default';
const POOL_PREVIEW = 'preview';
const VPOOL = { [POOL_DEFAULT]: [], [POOL_PREVIEW]: [] };
if (global) global.PIXIPLY_VPOOL = VPOOL;

const VQ = new Queue();
const VSIZE = 300; // todo: 好像这个尺寸并不影响渲染清晰度，默认300先
const PREVIEW_LIMIT = 2;
const MIME_TYPES = {
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
};

class VideoHolder {

  constructor(src, cid, userId=null) {
    this.loaded = false;
    this.uses = {};
    this.cid = cid;
    if (src instanceof VideoHolder) {
      if (src.loaded) {
        this.cloneVideo(src);
      } else {
        src = src.url;
      }
    }
    if (!this.loaded && typeof(src) === 'string') {
      this.$video = this.createVideo(src);
      this.url = src;
    }
    if (!this.url) {
      throw new Error(`VideoHolder.create with src error: ${src}`);
    }
    this.assignTo(userId);
  }

  get video() {
    return this.$video;
  }

  get id() {
    return this.$video.getAttribute('data-id');
  }

  set id(id) {
    this.$video.setAttribute('data-id', id);
  }

  connectGainNode() {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(this.$video);
    this.gainNode = ctx.createGain();
    source.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
  }

  setVolume(volume) {
    if (Utils.isUA('chrome')) {
      if (!this.gainNode) this.connectGainNode();
      this.gainNode.gain.value = volume;
    } else { // 很多浏览器不支持声音变大
      this.$video.volume = Math.min(1, volume);
    }
  }

  assignTo(userId) {
    if (!userId) return;
    this.userId = userId;
    if (!this.uses[userId]) this.uses[userId] = 0;
    this.uses[userId]++;
    if (!this.createBy) this.createBy = userId;
  }

  cloneVideo(src) {
    this.url = src.url;
    this.info = src.info;
    this.$video = src.$video.cloneNode(false);
    this.loaded = true;
    this._debugShow(this.$video);
  }

  createVideo(src) {
    const video = document.createElement('video');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('autoload', '');
    video.setAttribute('preload', 'auto');
    video.setAttribute('crossOrigin', 'Anonymous'); // 必须设置，不然可能*污染*canvas
    video.src = src;
    video.muted = true;
    video.width = VSIZE;
    video.height = VSIZE;

    const source = document.createElement('source');
    const baseSrc = src.split('?').shift().toLowerCase();
    const ext = baseSrc.slice(baseSrc.lastIndexOf('.') + 1);
    const mime = MIME_TYPES[ext] || `video/${ext}`;

    source.src = src;
    source.type = mime;
    video.appendChild(source);

    this._debugShow(video);
    return video;
  }

  _debugShow(video) {
    const debugCtr = document.getElementById('pixi-player-debug-container');
    if (!debugCtr) return; // for debug view
    // todo: may raise cover image CORS error on mobile browser
    // video.controls = "controls";
    // video.style = "background:#000";
    debugCtr.appendChild(video);
  }

  release() {
    this.userId = null;
  }

  getInfo() {
    return new Promise((resolve, reject) => {
      if (this.loaded) return this.info ? resolve(this.info) : reject();
      const cleanListeners = () => {
        if (this.metaCb) {
          this.$video.removeEventListener('loadedmetadata', this.metaCb);
          this.metaCb = null;
        }
        if (this.errorCb) {
          this.$video.removeEventListener('error', this.errorCb);
          this.errorCb = null;
        }
        if (this.timeout) {
          clearTimeout(this.timeout);
          this.timeout = null;
        }
      }
      this.metaCb = (e) => {
        this.loaded = true;
        if (!this.$video) return reject();
        const { duration, videoWidth, videoHeight } = this.$video;
        this.info = { width: videoWidth, height: videoHeight, duration };
        resolve(this.info);
        cleanListeners();
      };
      this.errorCb = (e) => {
        this.loaded = true;
        reject();
        cleanListeners();
      }
      if (this.$video.readyState > 0) {
        return this.metaCb();
      }
      this.$video.addEventListener('loadedmetadata', this.metaCb);
      this.$video.addEventListener('error', this.errorCb);
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        if (this.loaded) return;
        // this.loaded = true;
        reject();
        cleanListeners();
      }, 60000); // 60s timeout
    });
  }

  destroy() {
    if (this.$video) {
      // cancel request
      this.$video.src = '';
      this.$video.srcObject = null;
      this.$video.remove();
    }
    this.$video = null;
    this.userId = null;
  }

  static release(cid) {
    for (const [key, pool] of Object.entries(VPOOL)) {
      VPOOL[key] = pool.filter(vh => {
        if (vh.cid !== cid) return true;
        vh.destroy();
        return false;
      });
    }
  }

  // static async grantPlay(cid) {
  //   await Promise.all(VPOOL[POOL_DEFAULT].map(async (vh) => {
  //     if (vh.cid !== cid) return;
  //     const video = vh.$video;
  //     const muted = video.muted; // 先mute，不出声
  //     video.muted = true;
  //     await video.play();
  //     return new Promise(resolve => {
  //       setTimeout(() => {
  //         video.pause(); // 开始play之后，立刻暂停并恢复原先的mute状态
  //         video.muted = muted;
  //         setTimeout(() => resolve(), 1);
  //       }, 1);
  //     });
  //   }));
  // }

  static get(url, cid, userId) {
    return new Promise((resolve, reject) => {
      VQ.enqueue(async () => { // 用Queue避免并发导致重复
        try {
          resolve(await this._get_(url, cid, userId));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  static _get_(url, cid, userId) {
    return new Promise((resolve, reject) => {
      const poolKey = userId.endsWith('preview') ? POOL_PREVIEW : POOL_DEFAULT;
      const vs = VPOOL[poolKey].filter(vh => (vh.url === url && vh.cid === cid));
      // 先找已经分配给这个user的（同一个user同时不能申请2个）
      let vh = vs.filter(vh => vh.userId === userId)[0];
      if (vh) return resolve(vh);

      // 再找目前无主的
      vh = vs.filter(vh => !vh.userId)[0];
      // console.log('VH.get', userId, vs.map(x => x.id), vh?.id);
      // 如果多个node引用同一个视频，默认可以创建2个holder（基于假设它们时间上会有重叠，需要提前准备seek）
      if (vh && (vs.length > 1 || vh.createBy === userId)) {
        vh.assignTo(userId);
        return resolve(vh);
      }

      // preview的pool限制大小
      if (poolKey === POOL_PREVIEW && vs.length >= PREVIEW_LIMIT) {
        return reject('pool is busy');
      }

      // 新建一个
      vh = new VideoHolder(vs[0] || url, cid, userId);
      vh.id = `${md5(url).substring(0, 4)}_${vs.length + 1}`;
      VPOOL[poolKey].push(vh);
      resolve(vh);
    });
  }
}

export default VideoHolder;