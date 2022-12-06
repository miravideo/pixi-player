import { Texture, Sprite } from "pixi.js";
import Image from './image';
import VideoMaterial from "../material/video";
// import VideoMaterial from "../material/fvideo";
import STATIC from "../core/static";

class Video extends Image {
  constructor(conf) {
    super({...conf, type: 'video'});
  }

  get hasAudio() {
    return !this.getConf('muted');
  }

  createMaterial() {
    return new VideoMaterial(this);
  }

  mute(muted) {
    if (this.material) this.material.muted = this.getConf('muted') || muted;
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    const playing = (type === STATIC.VIEW_TYPE_PLAY);
    if (view && playing) {
      // 因为存在trans补帧，按照实际onTime来决定是否mute (而不是drawTime)
      // this.mute(!this.onShow(absTime));
    } else {
      const dt = absTime - this.absDrawStartTime;
      if (-1 < dt && dt < 0 && playing) {
        this.material.prepare(this.absDrawStartTime - this.absStartTime, type);
      } else {
        // pause会清空prepare状态
        this.material.pause();
      }
    }
    return view;
  }
}

export default Video;