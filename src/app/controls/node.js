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
    node.creator().allNodes.map(n => {
      if (n.groupId === node.groupId) this.nodes[n.id] = n;
    });
    this.id = node.groupId;
    return true;
  }

  get display() {
    return this._proxy;
  }

  annotate() {}

  addEventsTo(editor, enable) {
    editor.apply({ node: this, enable, recursive: false, types: { group: true } });
  }

  creator() {
    if (this.parent) return this.parent.creator();
    return this._proxy;
  }

  emit(type, args={}) {
    super.emit(type, {...args, target: this});
  }

  getAnchor() {
    return this._anchor;
  }

  getRotation() {
    return this._rotation;
  }

  getX() {
    return this.getXY()[0];
  }

  getY() {
    return this.getXY()[1];
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

  setRotate(rotation) {
    this._rotation = rotation;
    return this;
  }

  setXY(x, y) {
    this._position.x = x;
    this._position.y = y;
    return this;
  }

  setWH(w, h) {
    this._size.w = w;
    this._size.h = h;
    return this;
  }

  fitSize() {}
  fitTexture() {}

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
    this._rotation = node.getRotation();
    const [ x, y ] = node.getXY();
    const { x: ax, y: ay } = node.getAnchor();
    const [ w, h ] = node.getWH();
    this._size = { w, h };
    this._anchor = { x: ax, y: ay };
    this._position = { x, y };
    return this;
  }

  remove() {
    this.parent && this.parent.removeChild(this);
    return this;
  }

  destroy() {
    this._proxy = null;
    this.removeAllListeners();
  }
}

module.exports = Node;
