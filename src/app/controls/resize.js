'use strict';

const MiraEditorResize = require('../views/resize-view');
const Move = require('./move');
const { round } = require('../utils/math');

const MIN_BAR_SIZE = 50;
const MIN_DOT_SIZE = 30;
const { LEFT, TOP, RIGHT, BOTTOM } = MiraEditorResize;

class Resize extends Move {
  static type = "resize";
  static TAG = MiraEditorResize;

  show(show) {
    if (show === undefined) show = !this.selector.withMulti;
    if (!show) { //hide
      Object.values(this._controls).map(ctl => ctl.show(show));
    } else if (this.box) {
      this.updateShow(this.box);
    }
    return this;
  }

  controls() {
    if (this.node.conf.resizeDisable || this.node.cropMode) return {};
    const SCALE_CTLS = {
      topLeft:     { pos: TOP | LEFT,     styleClass: 'dot' },
      topRight:    { pos: TOP | RIGHT,    styleClass: 'dot' },
      bottomRight: { pos: BOTTOM | RIGHT, styleClass: 'dot' },
      bottomLeft:  { pos: BOTTOM | LEFT,  styleClass: 'dot' },
    };
    if (['image', 'video'].includes(this.node.type)) return SCALE_CTLS;
    const SKEW_CTLS = {
      left:  { pos: LEFT,  styleClass: 'ver' },
      right: { pos: RIGHT, styleClass: 'ver' },
    }
    if (this.node.type === 'group') {
      // 如果group里的都是text，可以允许批量横向拉伸
      return Object.values(this.node.nodes).every(x => x.type === 'text') ? 
        {...SKEW_CTLS, ...SCALE_CTLS} : SCALE_CTLS;
    }
    if (this.node.type !== 'text') {
      SKEW_CTLS['top']    = { pos: TOP,    styleClass: 'hor' };
      SKEW_CTLS['bottom'] = { pos: BOTTOM, styleClass: 'hor' };
    }
    return {...SKEW_CTLS, ...SCALE_CTLS};
  }

  updateShow(box) {
    const forceHide = box.hasClass('editMode');
    const classShow = { 
      hor: box.size.width * box.scale > MIN_BAR_SIZE,
      ver: ['text', 'group'].includes(this.node?.type) || box.size.height * box.scale > MIN_BAR_SIZE,
      dot: Math.min(box.size.width, box.size.height) * box.scale > MIN_DOT_SIZE,
    }
    for (const [key, ctl] of Object.entries(this._controls)) {
      if (forceHide) ctl.show(false);
      else ctl.show(key === 'bottomRight' ? true : classShow[ctl.styleClass]);
    }
  }

  getDelta(event) {
    const useScale = ['image', 'video'].includes(this.node.type);
    return event.target.constraint(event.delta, null, useScale);
  }

  async onMove(event) {
    if (!this.node || !this.box) return;
    const delta = this.getDelta(event);
    if (Math.round(delta.width) === 0 && Math.round(delta.height) === 0) return;
    if (this.node.width + delta.width < 1 || this.node.height + delta.height < 1) return;
    const attrs = {};
    if (this.node.type === 'text' && delta.height) {
      // text高度变了，就把font-size也一起变了(等比例)
      const { height } = this.getViewAttr({ height: 0 });
      attrs.fontSize = this.node.fontSize * (1 + (delta.height / height));
      // 如果原先没有height，也不要设置
      if (!this.node.conf.height) delete delta.height;
    }
    await this.update(delta, attrs);
    this.box.resize();
    const { width, height } = round(this.box.size, 0);
    this.toast(`${width} × ${height}`, 1000);
  }
}

module.exports = Resize;