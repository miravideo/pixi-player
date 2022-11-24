'use strict';

const { CHANGING, SELECT } = require('../utils/static');
const MiraEditorResize = require('../views/resize-view');
const MiraEditorCrop = require('../views/crop-view');
const Move = require('./move');
const { round, norm2d } = require('../utils/math');
const Point = require('../utils/point');
const { dmap } = require('../utils/data');

const MIN_DISTANCE = 10;
const { LEFT, TOP, RIGHT, BOTTOM } = MiraEditorResize;

class Crop extends Move {
  static type = "crop";
  static TAG = MiraEditorResize;

  constructor(editor) {
    super(editor);
    this.wrap(this.selector, 'fit').after(() => {
      this.fit(); // fit on resize
    });
    this.timeupdate = () => {
      if (this._controls?.origin) {
        this._controls?.origin.updateImage();
      }
    }
    editor.on('timeupdate', this.timeupdate);
  }

  fit() {
    if (!this._controls.origin || !this._controls.cropped) return;
    this._controls.origin.fit();
    this._controls.cropped.fit();
    this.updateShow(this.box);
    this.box.resize();
  }

  show(show) {
    // always show
    // Object.values(this._controls).map(ctl => ctl.show(true));
    return this;
  }

  controls() {
    if (this.node.cropMode !== 'frame') return {};
    const origCtrls = {
      origin: { tag: MiraEditorCrop, canvas: this.node.material.canvas, styleClass: 'origin' },
      originTopLeft:     { box: 'origin', pos: TOP | LEFT,     styleClass: 'dot' },
      originTopRight:    { box: 'origin', pos: TOP | RIGHT,    styleClass: 'dot' },
      originBottomRight: { box: 'origin', pos: BOTTOM | RIGHT, styleClass: 'dot' },
      originBottomLeft:  { box: 'origin', pos: BOTTOM | LEFT,  styleClass: 'dot' },
    }
    const cropCtrls = {
      cropped: { tag: MiraEditorCrop, box: 'origin', styleClass: 'cropped' },
      left:   { box: 'cropped', pos: LEFT,   styleClass: 'ver' },
      right:  { box: 'cropped', pos: RIGHT,  styleClass: 'ver' },
      top:    { box: 'cropped', pos: TOP,    styleClass: 'hor' },
      bottom: { box: 'cropped', pos: BOTTOM, styleClass: 'hor' },
      topLeft:     { box: 'cropped', pos: TOP | LEFT,     styleClass: 'dot' },
      topRight:    { box: 'cropped', pos: TOP | RIGHT,    styleClass: 'dot' },
      bottomRight: { box: 'cropped', pos: BOTTOM | RIGHT, styleClass: 'dot' },
      bottomLeft:  { box: 'cropped', pos: BOTTOM | LEFT,  styleClass: 'dot' },
    };
    // return { ...origCtrls, ...cropCtrls };
    return this.selector.cropMode ? 
      { origin: origCtrls.origin, ...cropCtrls} : 
      { ...origCtrls, ...cropCtrls };
  }

  updateShow(box) {
    if (!this._controls.origin || !this._controls.cropped) return;
    const dw = (this._controls.origin.size.width - this._controls.cropped.size.width) * 0.5;
    const dh = (this._controls.origin.size.height - this._controls.cropped.size.height) * 0.5;
    const { x, y } = this._controls.cropped.position;
    const dots = {
      'originTopLeft': [dw + x, dh + y],
      'originTopRight': [dw - x, dh + y],
      'originBottomRight': [dw - x, dh - y],
      'originBottomLeft': [dw + x, dh - y],
    }
    for (const [k, p] of Object.entries(dots)) {
      if (!this._controls[k]) continue;
      this._controls[k].show(norm2d(p) * box.scale > MIN_DISTANCE);
    }
  }

  getDelta(event) {
    if (event.target.constraint) {
      return event.target.constraint(event.delta);
    } else {
      return super.getDelta(event); // Move.getDelta
    }
  }

  async onMove(event) {
    if (!this.canMove) return;
    const [ mw, mh ] = [this.node.material.width, this.node.material.height];
    const oriFrame = this.node.frame || { x: 0, y: 0, w: mw, h: mh };
    const delta = this.getDelta(event);
    const isMove = event.target.styleClass === 'origin';
    const isOrigin = (event.target.parentNode === this._controls.origin || isMove);

    // rotation
    if (this.box.rotation != 0) {
      const { x, y } = new Point(delta.x, delta.y).rotate(-this.box.rotation);
      delta.x = x;
      delta.y = y;
    }

    const frame = {
      x: delta.x || 0, y: delta.y || 0,
      w: delta.width || 0, h: delta.height || 0,
    };
    const cs = this._controls.cropped.size;
    const cp = this._controls.cropped.position;
    const os = this._controls.origin.size;

    if (this.selector.cropMode && isMove) {
      // 移动内框时，实际上也要移动position, 公式I
      frame.x = (mw * (cp.x + frame.x) / (os.width + frame.w))  - (mw * cp.x / os.width);
      frame.y = (mh * (cp.y + frame.y) / (os.height + frame.h)) - (mh * cp.y / os.height);
      frame.w = frame.h = 0;
    } else if (isOrigin) {
      frame.x = -((mw * (cp.x + frame.x) / (os.width + frame.w))  - (mw * cp.x / os.width));
      frame.y = -((mh * (cp.y + frame.y) / (os.height + frame.h)) - (mh * cp.y / os.height));
      frame.w = +((mw *     cs.width     / (os.width + frame.w))  - (mw * cs.width / os.width));
      frame.h = +((mh *     cs.height    / (os.height + frame.h)) - (mh * cs.height / os.height));
    } else {
      frame.x *= (mw / os.width);
      frame.y *= (mh / os.height);
      frame.w *= (mw / os.width);
      frame.h *= (mh / os.height);
    }

    // 约束，不然crop超过原画幅边界
    const [ dx, dy ] = event.target.direction || [0, 0];
    if (oriFrame.x + frame.x < 0) {
      if (isMove || dx > 0) frame.x = - oriFrame.x;
      else return;
    }
    if (oriFrame.y + frame.y < 0) {
      if (isMove || dy > 0) frame.y = - oriFrame.y;
      else return;
    }
    if (oriFrame.x + oriFrame.w + frame.x + frame.w > mw) {
      if (isMove || dx < 0) frame.x = mw - (oriFrame.x + oriFrame.w + frame.w);
      else return;
    }
    if (oriFrame.y + oriFrame.h + frame.y + frame.h > mh) {
      if (isMove || dy < 0) frame.y = mh - (oriFrame.y + oriFrame.h + frame.h);
      else return;
    }

    // delta frame -> percentage frame
    const absFrame = dmap(frame, (v, k) => v + oriFrame[k]);
    const pframe = {
      x: absFrame.x / mw,
      y: absFrame.y / mh,
      w: Math.min(absFrame.w, mw - absFrame.x) / mw,
      h: Math.min(absFrame.h, mh - absFrame.y) / mh,
    };

    let attrs = { pframe };
    if (this.selector.cropMode && isMove) {
      // 上面公式I的逆运算，其实 x = delta.position.x 只是被约束之后，只能反过来计算了
      const x = (frame.x + (mw * cp.x / os.width)) * os.width / mw - cp.x;
      const y = (frame.y + (mh * cp.y / os.height)) * os.height / mh - cp.y;
      let _attrs = this.getAttrs({x, y});
      if (this.box.rotation != 0) {
        const { x, y } = new Point(applyDelta.position).rotate(this.box.rotation);
        _attrs = this.getAttrs({x, y});
      }
      Object.assign(attrs, _attrs);

    } else if (!isOrigin) { // resize inner box
      const _delta = event.target.constraint(event.delta, this.box.anchor);
      const [_f, _mw, _mh, _scale] = this._controls.cropped.metrics();

      Object.assign(attrs, this.getAttrs({x: _delta.x, y: _delta.y}));
      // node的宽高跟frame保持一致
      attrs.width = absFrame.w * _scale;
      attrs.height = absFrame.h * _scale;
    }

    await this.editor.update([this.node], attrs, this.id);
    this.fit();
  }

  get canMove() {
    return (this.node && this.box);
  }

  onMoveStart(event) {
    if (!this.canMove) return;
    this.node.emit(CHANGING, {action: `${this.constructor.type}start`});
    this._controls.cropped.showGrid();
    return this;
  }

  onMoveEnd(event) {
    if (!this.canMove) return;
    this.node.emit(CHANGING, {action: `${this.constructor.type}end`});
    return this;
  }

  destroy() {
    this.editor.off('timeupdate', this.timeupdate);
    this.timeupdate = null;
    return super.destroy();
  }
}

module.exports = Crop;