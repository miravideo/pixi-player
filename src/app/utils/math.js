'use strict';

const { dmap } = require('./data');
const Point = require('./point');

const MathUtil = {
  deg: (rad, decimal=0) => {
    while (rad < 0) rad += 2 * Math.PI;
    while (rad > Math.PI) rad -= 2 * Math.PI;
    return MathUtil.round((rad * (180 / Math.PI)) % 360, decimal);
  },
  rad: (deg, decimal=9) => {
    return MathUtil.round(deg * (Math.PI / 180), decimal);
  },
  round: (n, decimal=0) => {
    return typeof n === 'object' ? 
      dmap(n, v => MathUtil.round(v, decimal)) : 
      (isNaN(n) ? n : Number(n.toFixed(decimal)));
  },
  floor: (n, decimal=0) => {
    return MathUtil.apply(Math.floor, n, decimal);
  },
  ceil: (n, decimal=0) => {
    return MathUtil.apply(Math.ceil, n, decimal);
  },
  apply: (func, n, decimal=0) => {
    const p = Math.pow(10, decimal);
    return Number((func(n*p) / p).toFixed(decimal));
  },
  theta: (p1, p2) => {
    p1 = new Point(p1), p2 = new Point(p2);
    const θ = Math.acos(MathUtil.dot(p1, p2) / (MathUtil.norm2d(p1) * MathUtil.norm2d(p2)));
    return θ * (MathUtil.cross(p1, p2) > 0 ? 1 : -1);
  },
  norm2d: (p) => {
    const { x, y } = new Point(p);
    return Math.hypot(x, y); // fast than Math.sqrt(x*x + y*y);
  },
  cross: (p1, p2) => {
    p1 = new Point(p1), p2 = new Point(p2);
    return (p1.x * p2.y) - (p2.x * p1.y);
  },
  dot: (a, b) => {
    return MathUtil.sum(MathUtil.arrMulti(a, b));
  },
  sum: (n) => {
    if (typeof n !== 'object') return n;
    return Object.values(n).reduce((a,i) => i+a);
  },
  arrMulti: (a, b) => {
    return MathUtil.arrMap(a, b, (a1, b1) => a1 * b1);
  },
  arrAnd: (a, b) => {
    return MathUtil.arrMap(a, b, (a1, b1) => a1 & b1);
  },
  arrFill: (a, len) => {
    return new Array(len).fill(a);
  },
  arrMap: (a, b, func) => {
    if (typeof a === 'object') a = Object.values(a);
    if (typeof b === 'object') b = Object.values(b);
    if (!Array.isArray(a)) a = MathUtil.arrFill(a, b.length);
    if (!Array.isArray(b)) b = MathUtil.arrFill(b, a.length);
    if (a.length !== b.length) throw new Error(`length not match when array apply ${func}`);
    return a.map((_, i) => func(a[i], b[i]));
  }
}

module.exports = MathUtil;