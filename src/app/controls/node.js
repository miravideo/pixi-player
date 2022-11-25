'use strict';

const EventEmitter = require('../utils/event');
const Rect = require('../utils/rect');
const { rotate } = require('../utils/math');
const Point = require('../utils/point');

let __id__ = 0;

class Node extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf || {};
    this.type = this.conf.type || 'vnode';
    this.id = `vn_${this.type}_${__id__++}`;
    this.scale = 1.0;
    this._rotation = 0;
    this._anchor = { x: 0.5, y: 0.5 };
    this._size = { w: 0, h: 0 };
    this._position = { x: 0, y: 0 };
    this._proxy = new Proxy(this, {});
  }

  static from(node) {
    return (new Node()).syncWith(node);
  }

  groupSelect(node) {
    if (!node.groupId || node.groupId == 'NULL' || !this.nodes) return false;
    node.root().allNodes.map(n => {
      if (n.groupId === node.groupId) this.nodes[n.id] = n;
    });
    this.id = node.groupId;
    return true;
  }

  getView() {
    return this._proxy;
  }

  annotate() {}

  addEventsTo(editor, enable) {
    // editor.apply({ node: this, enable, recursive: false, types: { group: true } });
  }

  get player() {
    if (this.parent) return this.parent.player;
    return this._proxy;
  }

  emit(type, args={}) {
    super.emit(type, {...args, target: this});
  }

  get anchor() {
    return this._anchor;
  }

  get rotation() {
    return this._rotation;
  }

  get x() {
    return this.getXY()[0];
  }

  get y() {
    return this.getXY()[1];
  }

  get width() {
    return this.getWH()[0];
  }

  get height() {
    return this.getWH()[1];
  }

  set rotation(v) {
    this._rotation = v;
  }

  set x(v) {
    this._position.x = v;
  }

  set y(v) {
    this._position.y = v;
  }

  set width(v) {
    this._size.w = v;
  }

  set height(v) {
    this._size.h = v;
  }

  applyScale(scale) {
    this.width *= scale;
    this.height *= scale;
  }

  getXY() {
    return this.metrcs().position;
  }

  getWH() {
    return this.metrcs().size;
  }

  metrcs() {
    const position = [ this._position.x, this._position.y ];
    const size = [ this._size.w, this._size.h ];
    return { position, size };
  }

  fitSize() {}
  fitTexture() {}
  updateView() {}

  points() {
    const { w, h } = this._size;
    const x = - w * this._anchor.x;
    const y = - h * this._anchor.y;
    const points = [ [ x, y ], [ x + w, y ], [ x, y + h ], [ x + w, y + h ] ];
    // topLeft, topRight, bottomLeft, bottomRight
    return points.map(pt => {
      return (new Point(pt)).rotate(this._rotation).offset(this._position);
    });
  }

  bounds() {
    return Rect.bounds(this.points());
  }

  syncWith(node) {
    const view = node.getView();
    this._rotation = view.rotation;
    const [ x, y ] = [view.x, view.y];
    const { x: ax, y: ay } = view.anchor;
    const [ w, h ] = [view.width, view.height];
    this._size = { w, h };
    this._anchor = { x: ax, y: ay };
    this._position = { x, y };
    return this;
  }

  remove() {
    this.parent && this.parent.removeChild(this);
    return this;
  }

  getConf(key) {
    // console.log('vnode.getConf', key);
    return this[key];
  }

  setConf(key, value) {
    // console.log('vnode.setConf', key, value);
    this[key] = value;
  }

  destroy() {
    this._proxy = null;
    this.removeAllListeners();
  }
}

module.exports = Node;
