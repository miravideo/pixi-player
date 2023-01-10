import Div from './div';

class Watermark extends Div {
  constructor(conf) {
    super({...conf, type: 'watermark'});
  }

  get hasAudio() {
    return false; // todo: audio watermark??
  }

  addChild(child, insertBefore) {
    super.addChild(child, insertBefore);
    this.allNodes.map(x => {
      x.conf.editable = false;
    });
  }

  updatezIndex() {
    const canvas = this.root();
    if (canvas) {
      // ensure on top of everything.
      this.zIndex = Math.max(...canvas.allNodes.map(x => x === this ? 0 : x.zIndex)) + 1;
    }
  }
}

export default Watermark;