'use strict';

class Point {
  constructor(...args) {
    let x, y;
    if (args.length == 1 && typeof(args[0]) === 'object') {
      if (args[0].nodeType === 1) args = this.getDomCoord(args[0]);
      else if (args[0].pageX !== undefined) args = [args[0].pageX, args[0].pageY];
    }
    if (args.length == 1 && Array.isArray(args[0])) args = args[0];
    if (args.length == 2 && Array.isArray(args)) [ x, y ] = args;
    if (typeof args[0] === 'object') {
      this.x = args[0].x;
      this.y = args[0].y;
      return;
    }
    this.x = x;
    this.y = y;
  }

  getDomCoord(el) {
    let [x, y] = [el.offsetLeft, el.offsetTop];
    let current = el.offsetParent;
    while (current !== null){
      x += current.offsetLeft;
      y += current.offsetTop;
      current = current.offsetParent;
    }
    return [x, y];
  }

  offset (p) {
    p = new Point(p);
    return new Point({ x: this.x + p.x, y: this.y + p.y });
  }

  rebase (p) {
    p = new Point(p);
    return this.offset({ x: -p.x, y: -p.y });
  }

  scale (scale) {
    const s = isNaN(scale) ? new Point(scale) : new Point(scale, scale);
    return new Point({ x: this.x * s.x, y: this.y * s.y });
  }

  rotate (θ) { // 顺时针旋转θ角之后的坐标
    const [ x, y ] = [ this.x, - this.y ]; // reverse Y for rotation origin direction up ⬆
    const m = { sin: Math.sin(θ), cos: Math.cos(θ) };
    return new Point({ x: x*m.cos+y*m.sin, y: -(y*m.cos-x*m.sin) });
  }

  f(n=3) {
    return { x: this.x.toFixed(n), y: this.y.toFixed(n) };
  }
}

module.exports = Point;