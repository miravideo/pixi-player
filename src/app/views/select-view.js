'use strict';

require('../styles/select.less');
const MiraEditorBase = require('./base-view');
const Point = require('../utils/point');
const Rect = require('../utils/rect');
const { floor, ceil, round, deg, theta, arrMulti, norm2d } = require('../utils/math');

class MiraEditorBox extends MiraEditorBase {
  static TAG = 'mira-editor-box';

  init() {
    this.addClass("mirae-box");
    // this.addClass("mirae-center-cross");
    this.scale = 1.0;
    return super.init();
  }

  get nodeView() {
    return this.node.getView();
  }

  bind(node) {
    this.node = node;
    return this.refresh();
  }

  refresh() {
    this.toggleClass("mirae-box-none", !!this.node.cropMode);
    if (this.node.type === 'group') {
      this.toggleClass("group-locked", !!this.node.groupLocked);
    }
    return this;
  }

  setAnchor(opts) {
    const { x, y } = opts || this.nodeView.anchor;
    this.anchor = { x, y };
    return this.setStyle({ 'transform-origin': `${round(x*100, 1)}% ${round(y*100, 1)}%` });
  }

  setRotate(rotation) {
    if (rotation === undefined) rotation = this.nodeView.rotation;
    this.rotation = rotation % (2*Math.PI);
    const _deg = deg(this.rotation, 1);
    return this.setStyleVars({ '--rotate': `${_deg}deg`, '--revert-rot': `${-_deg}deg`});
  }

  setXY(opts) {
    let [ x, y ] = opts || [this.nodeView.x, this.nodeView.y];
    this.position = new Point({ x, y });
    const { width, height } = this.size;
    x = (x - width * this.anchor.x) * this.scale;
    y = (y - height * this.anchor.y) * this.scale;
    return this.setStyleVars({ '--x': `${floor(x-1)}px`, '--y': `${floor(y-1)}px` });
  }

  setWH(opts) {
    let [ width, height ] = opts || [this.nodeView.width, this.nodeView.height];
    this.size = { width, height };
    width = `${ceil(width*this.scale+2)}px`;
    height = `${ceil(height*this.scale+2)}px`;
    return this.setStyle({ width, height });
  }

  crop() {
    return this;
  }

  move() {
    return this.setXY().refreshHandle();
  }

  resize() { // when resize(w,h), position(x,y) may change together.
    return this.setWH().move();
  }

  rotate() {
    return this.setRotate();
  }

  fit(scale) {
    this.scale = scale;
    return this.setAnchor().setRotate().resize();
  }

  select(selected) {
    if (selected) this.addHandleBox();
    const className = "mirae-selected";
    return selected ? this.addClass(className) : this.removeClass(className);
  }

  points() { // raw metic, without scale!
    const { width: w, height: h } = this.size;
    const x = - w * this.anchor.x;
    const y = - h * this.anchor.y;
    const points = [ [ x, y ], [ x + w, y ], [ x, y + h ], [ x + w, y + h ] ];
    // topLeft, topRight, bottomLeft, bottomRight
    return points.map(pt => {
      return (new Point(pt)).rotate(this.rotation).offset(this.position);
    });
  }

  bounds(proj=null) {
    return Rect.bounds(this.points().map(pt => proj ? proj(pt) : pt));
  }

  addHandleBox() {
    if (this.handleBox) return;
    this.handleBox = document.createElement('div');
    this.handleBox.setAttribute('mira-editor-el', '');
    this.handleBox.classList.add('mirae-box-handles', 'left');
    this.append(this.handleBox);
  }

  refreshHandle() {
    const ctr = this.parentNode;
    if (!this.handleBox || !ctr) return this;
    const { width, height, canvas } = this.node.player;

    // calc editor container bounds (includes margin)
    const mTop = this.styleNumber('marginTop', canvas) / this.scale;
    const mLeft = this.styleNumber('marginLeft', canvas) / this.scale;
    const bounds = [['x', -mLeft, 1], ['x', width+mLeft, -1], ['y', -mTop, 1], ['y', height+mTop, -1]];

    // get the max distance to nearest bounds.
    const { width: w, height: h } = this.size;
    const left = - w * this.anchor.x;
    const top = - h * this.anchor.y;
    const points = [ [ left, 0 ], [ 0, top ], [ 0, top + h ], [ left + w, 0 ] ];
    const dists = points.map(pt => {
      const p = (new Point(pt)).rotate(this.rotation).offset(this.position);
      // return nearest distance to bounds, may < 0 for out of bounds
      return Math.min(...bounds.map(([k, v, a]) => (p[k] - v) * a));
    });

    dists[2] += 10; // 相比top, 优先bottom, 因下方控件空间更多 (没有考虑转了超过90度的情况)
    const maxDist = Math.max(...dists); // get the max off bounds (may near to the center)
    const maxIdx = dists.indexOf(maxDist);

    const classList = this.handleBox.classList;
    const positions = [ 'left', 'top', 'bottom', 'right' ];
    const idx = positions.map(p => classList.contains(p)).findIndex(x => x);
    // 如果当前控件点距离跟最小距离的差，小于10，就暂时不改，避免跳动
    if (idx === maxIdx || (maxDist - dists[idx]) < 10) return this;
    classList.remove(...positions);
    classList.add(positions[maxIdx]);
    this.setRotate(); // update rotate cursor
    return this;
  }

  remove() {
    if (this.handleBox) this.handleBox.remove();
    super.remove();
  }

  static create({node, scale, container, selected}) {
    return super.create(container).bind(node).select(selected).fit(scale || 1.0);
  }
}

MiraEditorBox.register();
module.exports = MiraEditorBox;