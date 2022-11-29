import Clip from "../core/clip";

class Track extends Clip {
  constructor(conf = {}) {
    super({ type: 'track', ...conf });
  }

  get isTrack() {
    return true;
  }

  addChild(child, insertBefore=null) {
    super.addChild(child, insertBefore);
    if (!insertBefore) {
      child.prevSibling = this.lastChild;
      if (this.lastChild) this.lastChild.nextSibling = child;
      this.lastChild = child;
    } else {
      // prev relation of child
      if (insertBefore.prevSibling) insertBefore.prevSibling.nextSibling = child;
      child.prevSibling = insertBefore.prevSibling;
      // next relation of child
      insertBefore.prevSibling = child;
      child.nextSibling = insertBefore;
    }
  }

  removeChild(child) {
    super.removeChild(child);
    if (this.lastChild === child) this.lastChild = child.prevSibling;
    if (child.prevSibling) child.prevSibling.nextSibling = child.nextSibling;
    if (child.nextSibling) child.nextSibling.prevSibling = child.prevSibling;
    child.prevSibling = null;
    child.nextSibling = null;
  }

  createDisplay() { }

  annotate() {
    this.lastChildEndTime = this.lastChild ? this.lastChild.endTime : 0;
  }

  get absStartTime() {
    return 0;
  }

  get absEndTime() {
    return this.endTime;
  }

  get startTime() {
    return 0;
  }

  get duration() {
    return this.endTime - this.startTime;
  }

  get endTime() {
    return this.lastChildEndTime;
  }

}

export default Track;