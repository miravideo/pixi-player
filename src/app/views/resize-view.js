'use strict';

require('../styles/resize.less');
const MiraEditorRotate = require('./rotate-view');
const { sum, arrMulti, norm2d, deg, dot, theta } = require('../utils/math');
const Point = require('../utils/point');
const SQ8 = 2.8284271247; // 8 ^ 0.5;

class MiraEditorResize extends MiraEditorRotate {
  static TAG = 'mira-editor-resize';
  static STYLE_CLASS = 'mirae-resize';
  static CURSOR_CLASS = 'mirae-rze-cursor';
  static RA_NUM = 12;

  // mat: {x1, y1, x2, y2} as topLeft:(x1,y1) bottomRight:(x2,y2)
  static LEFT   = 0b1000;
  static TOP    = 0b0100;
  static RIGHT  = 0b0010;
  static BOTTOM = 0b0001;

  has(c, m) {
    return (c & m) >> Math.log2(m);
  }

  mat(c) {
    const { LEFT, TOP, RIGHT, BOTTOM } = this.constructor;
    this._mat = [LEFT, TOP, RIGHT, BOTTOM].map(m => this.has(c, m));
    this.fixRatio = sum(this._mat) > 1;
    const r = arrMulti([-1, -1, 1, 1], this._mat);
    this.direction = [r[0]+r[2], r[1]+r[3]]; // [x, y];
    return this;
  }

  boundingConstraint() {
    const box = this.parentElement;
    // 把direction映射到长宽比例，然后旋转
    const direction = arrMulti(this.direction, [box.size.width, box.size.height]);
    const p = new Point({ x: direction[0], y: direction[1] }).rotate(box.rotation);
    return { x: [p.x < 0, false, p.x > 0], y: [p.y < 0, false, p.y > 0] };
  }

  /**
   * Reverse unscaled bounds delta to scaled event (handle) delta
   * IMPORTANT! +/- of delta value only refers to the position of bound,
   * left: x < 0, right: x > 0, top: y < 0, bottom: y > 0
   * @param {x:Number, y:Number} delta 
   */
  reverse(delta, polar=false) {
    const box = this.parentElement;
    delta = { x: 0, y: 0, ...delta };
    if (delta.x * delta.y !== 0) return;

    // 把direction投影到box为正的XY坐标的2个分量，旋转回屏幕坐标得到p1, p2
    const direction = arrMulti(this.direction, [box.size.width, box.size.height]);
    const p1 = new Point({ x: direction[0], y: 0 }).rotate(box.rotation);
    const p2 = new Point({ x: 0, y: direction[1] }).rotate(box.rotation);

    // θ = δ + ρ, 是direction(Resize拉伸方向)相对屏幕坐标Y轴(向上为正)的顺时针旋转角
    const θ = theta({ x: 0, y: -1 }, direction) + box.rotation;
    for (const [k, v] of Object.entries(delta)) {
      if (v === 0) continue; // 只应该有一个方向的约束，否则可能无解
      if (p1[k] * p2[k] < 0) { // 若p1/p2在K轴相反, 那就存在2个不同的方向，delta需要判断与矫正
        // max只是用来找跟delta同符号的p, p1+p2是求它们向量和
        delta[k] = Math.max(delta[k] / p1[k], delta[k] / p2[k]) * Math.abs(p1[k] + p2[k]);
      }

      // r = |Δx / sin(θ)|, |Δy / cos(θ)|
      const r = Math.abs((box.scale * delta[k]) / ((k === 'x') ? Math.sin(θ) : Math.cos(θ)));
      return polar ? { r, θ } : new Point({ x: 0, y: - r }).rotate(θ);
    }
  }

  constraint(delta, anchor=null, useScaleForFixRatio=true) {
    const box = this.parentElement;
    // scale & rotate
    delta = new Point({ x: delta.x / box.scale, y: delta.y / box.scale });
    delta = delta.rotate(-box.rotation); // 逆变换为box转正的坐标系
    if (!anchor) anchor = box.anchor;

    // constraint by w:h ratio
    if (this.fixRatio) {
      const direction = arrMulti(this.direction, [box.size.width, box.size.height]);
      // distance = (delta • direction) / |direction|^2
      //   = |delta| * |direction| * cos(θ) / |direction|^2
      //   = |delta| * cos(θ) / |direction|
      const distance = dot(delta, direction) / Math.pow(norm2d(direction), 2);
      // 根据控制点到锚点的距离，和对角线长度(SQ8)比值
      const a = SQ8 / norm2d([this.direction[0] - (2 * anchor.x - 1), this.direction[1] - (2 * anchor.y - 1)]);
      if (useScaleForFixRatio) return { scale: distance * a };
      delta = { x: direction[0] * distance, y: direction[1] * distance }
    }

    // delta of topLeft:(x1,y1) bottomRight:(x2,y2)
    const topLeft     = { x: this._mat[0] * delta.x, y: this._mat[1] * delta.y };
    const bottomRight = { x: this._mat[2] * delta.x, y: this._mat[3] * delta.y };

    const size = { width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
    // delta of anchor position, should reverse rotate 变换为屏幕坐标系
    const anchorPoint = [anchor.x * size.width, anchor.y * size.height];
    const position = new Point(topLeft).offset(anchorPoint).rotate(box.rotation);
    return { ...position, ...size };
  }

  box() {
    return this.parentElement;
  }

  raOffset() {
    return this.constructor.RA_NUM + this.raIdx;
  }

  setOpts(opts) {
    this.mat(opts.pos);
    this.addClass(['left','top','right','bottom'].filter((_, i) => this._mat[i]));
    const idxMap = this._mat.map((on, i) => on * (i + 1) << 1).filter(n => n > 0);
    this.raIdx = ((idxMap.length > 1 ? sum(idxMap) >> 1 : idxMap[0]) % 4 ) * 3;
    return super.setOpts(opts);
  }
}

MiraEditorResize.register();
module.exports = MiraEditorResize;