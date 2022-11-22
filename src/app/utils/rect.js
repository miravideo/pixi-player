'use strict';

const { MAX } = require('./static');
const { rotate } = require('./math');
const Point = require('./point');

import PluginUtil from '../../util/plugin';

const RectUtil = {
  intersect: (r1, r2) => {
    if (r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top) return;
    const [left, top] = ['left', 'top'].map(k => Math.max(r1[k], r2[k]));
    const [right, bottom] = ['right', 'bottom'].map(k => Math.min(r1[k], r2[k]));
    return new Rect({ top, bottom, left, right });
  },
  center: (rect) => {
    const { left, right, top, bottom } = rect;
    return new Point({ x: (left + right) / 2, y: (top + bottom) / 2 });
  },
  bounds: (points) => {
    const bounds = { top: MAX, left: MAX, bottom: 0, right: 0 };
    points.map((p) => {
      if (!(p instanceof Point)) p = new Point(p);
      const { x, y } = p;
      bounds.top =    Math.min(bounds.top,    y);
      bounds.bottom = Math.max(bounds.bottom, y);
      bounds.left =   Math.min(bounds.left,   x);
      bounds.right =  Math.max(bounds.right,  x);
    });
    return RectUtil.from(bounds);
  },
  from: (dict) => { // { top, bottom, left, right, x, y, width, height, w, h }
    return new Rect(dict);
  }
}

const ExpandRect = {
  get center() {
    return RectUtil.center(this);
  },

  get position() {
    return new Point(this.x, this.y);
  },

  xs(withCenter=true) {
    return this.ss([this.left, this.right], withCenter);
  },

  ys(withCenter=true) {
    return this.ss([this.top, this.bottom], withCenter);
  },

  ss(arr, withCenter=true) {
    return withCenter ? arr.splice(1, 0, (arr[0] + arr[1]) / 2) && arr : arr;
  },

  offset(p) {
    return this.move(p, 'offset');
  },

  rebase(p) {
    return this.move(p, 'rebase');
  },

  move(p, key) {
    const { x, y } = this.position[key](p);
    return RectUtil.from({x, y, width: this.width, height: this.height});
  },

  expand(p) {
    this.x -= p;
    this.y -= p;
    this.width += 2 * p;
    this.height += 2 * p;
    return this;
  }
}

class Rect extends DOMRect {
  constructor(...args) {
    if (args.length > 1) return super(...args);
    let { top, bottom, left, right, x, y, width, height, w, h } = args[0];
    x = x === undefined ? left : x;
    y = y === undefined ? top : y;
    w = w === undefined ? width : w;
    w = w === undefined ? right - x : w;
    h = h === undefined ? height : h;
    h = h === undefined ? bottom - y : h;
    super(x || 0, y || 0, w, h);
  }
}

PluginUtil.extends({ plugin: ExpandRect, tp: DOMRectReadOnly });

module.exports = RectUtil;