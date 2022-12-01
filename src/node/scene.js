import Container from './container';
import { Texture, Sprite, settings } from "pixi.js";

class Scene extends Container {
  constructor(conf) {
    super({type: 'scene', ...conf});
    this.defaultDuration = NaN;
  }

  createView() {
    const view = super.createView();
    const { width, height } = this.root();
    const canvas = settings.ADAPTER.createCanvas(width, height);
    const background = new Sprite(Texture.from(canvas));
    background.zIndex = 0;
    view.addChildAt(background, 0);
    return view;
  }

  annotate(record) {
    const { allNodes } = this;
    let maxAbsEnd = Math.max(...allNodes
      .filter(x => !x.isVirtual && !x.flexibleDuration)
      .map(x => x.realAbsEndTime));
    if (!maxAbsEnd) {
      maxAbsEnd = Math.max(...allNodes
        .filter(x => !x.isVirtual)
        .map(x => x.realAbsEndTime));
    }
    if (isFinite(maxAbsEnd)) {
      this.defaultDuration = maxAbsEnd - this.absStartTime;
    } else {
      this.defaultDuration = '100%';
    }
    super.annotate(record);
  }

  get default() {
    return {
      startTime: super.default.startTime,
      duration: this.defaultDuration,
    }
  }

}

export default Scene;