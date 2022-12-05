'use strict';

const { CHANGING, RESIZE, MAX } = require('../utils/static');
const { dmap, uuid } = require('../utils/data');
const { deg, rad } = require('../utils/math');
const Rect = require('../utils/rect');
const BaseControl = require('./base');
const Node = require('./node');
const Rotate = require('./rotate');
const Move = require('./move');
const MiraEditorLine = require('../views/constraint-view');
const MiraEditorBox = require('../views/select-view');

const CANVAS = 'canvas';
const MULTI_KEYS = ['Shift'];
const TYPES = ['image', 'video', 'text', 'mixin'];

class Constraint extends BaseControl {
  constructor(editor) {
    super(editor);
    this.limit = editor.opts.refLineRange;
    this.selector = editor.controls.select;
    this.refBounds = {};
    this._controls = {};

    // add hook
    this.wrap(this.selector, 'showSelect').after((args, selected) => {
      if (!selected) return; //  || !selected.visible || !selected.getAnchor
      this.updateConstraint();
      // this.createProxyNode(selected);
    });

    const $this = this;
    for (const op of ['resize', 'rotate', 'move']) {
      if (!editor.controls[op]) continue;
      this.wrap(editor.controls[op], 'onMoveStart').after(() => $this.onMoveStart());
      this.wrap(editor.controls[op], 'onMove').before(args => [$this.onMove(op, args[0])]);
      this.wrap(editor.controls[op], 'onMoveEnd').after(() => $this.onMoveEnd());
      this.wrap(editor.controls[op], 'update').after(() => {
        if ($this.debug_box) $this.debug_box.fit(this.scale);
      });
    }
  }

  events() {
    return { keydown: this.onKeyDown(), keyup: this.onKeyUp(), [RESIZE]: this.onResize() };
  }

  onKeyDown() {
    return (evt) => {
      if (Object.keys(Move.KEY_MAP).includes(evt.key)) this.limit = this.scale;
      if (MULTI_KEYS.includes(evt.key)) {
        this.limit = this.scale;
      }
    }
  }

  onKeyUp() {
    return (evt) => {
      if (MULTI_KEYS.includes(evt.key)) {
        this.limit = this.editor.opts.refLineRange;
      }
      this.lock(1000, () => this.hideAll(), 'hide');
    }
  }

  onResize() {
    return (evt) => {
      if (this.ctr) this.ctr.remove();
      this.ctr = null;
      // 避免窗口不断缩放时，不停的updateConstraint
      this.lock(500, () => this.updateConstraint(), 'resize');
    }
  }

  initContainer() {
    if (!this.ctr) {
      this.ctr = document.createElement('div');
      this.ctr.classList.add('mirae-constraint');
      this.ctr.setAttribute('mira-editor-el', '');
    }
    if (this.ctr.parentNode !== this.selector.container) {
      this.ctr.remove();
      this.selector.container.append(this.ctr);
    }
    // remove all children
    while (this.ctr.firstChild) {
      this.ctr.removeChild(this.ctr.firstChild);
    }
    this.refBounds = {}; // clear up refs
    this.scale = this.editor.scale;
  }

  onMoveStart() {
    this.ref = {};
    // 每次开始拖动的时候，都重置一下ProxyNode
    this.createProxyNode(this.selector.selected);
  }

  onMove(op, evt) {
    if (!this.selected || !this.editor.opts.enableCanvasConstraint) return evt;
    if (this.editor.controls.move?.editMode) return evt; // text in edit
    this.limit = evt.event.shiftKey ? this.scale : this.editor.opts.refLineRange;
    const control = this.editor.controls[op];
    const delta = control.getDelta(evt);
    this.update(delta);
    if (typeof this[op] === 'function') this[op].call(this, evt, delta);
    return evt;
  }

  onMoveEnd() {
    this.hideAll();
  }

  createProxyNode(node) {
    if (node.cropMode) return this.selected = null;
    if (this.selected) this.selected.destroy();
    this.selected = Node.from(node);
    // debug node box
    if (this.editor.opts.debugCanvasConstraint) {
      const { ctr, scale } = this;
      if (this.debug_box) this.debug_box.remove();
      this.debug_box = MiraEditorBox.create({ node: this.selected, container: ctr, scale }).addClass('mirae-debug-box');
      // this.selected.on(CHANGING, () => this.debug_box.fit(scale));
    }
  }

  updateConstraint() {
    this.initContainer();
    const target = this.selector.selected;
    if (!target) return;
    const targetIds = target.nodes ? Object.values(target.nodes).map(t => t.id) : [target.id];
    const nodes = Object.values(this.editor.nodes).filter(node => {
      return !targetIds.includes(node.id) && TYPES.includes(node.type) && node.onTime();
    });
    const { width, height } = this.editor.rootNode;
    this.canvas = Rect.from({ width, height }).expand(-this.editor.opts.canvasMarginRef);
    this.refBounds[CANVAS] = this.canvas; // 优先吸附canvas
    for (const node of nodes) {
      this.refBounds[node.id] = MiraEditorBox.create({node}).bounds();
    }
  }

  resize(evt, delta) {
    if (!this._resizeTarget || this._resizeTarget != evt.target) {
      this._resizeTarget = evt.target; // resize点更换之后，刷新虚拟node
      this.createProxyNode(this.selector.selected);
      this.update(delta); // 必须要apply一下，不然虚拟node就delay了
    }

    const rect = this.selected.bounds();
    const oriRect = this.selector.selectedBox.bounds();
    const mask = evt.target.boundingConstraint();

    const min = { x: [ MAX, null ], y: [ MAX, null ] };
    for (const k of ['x', 'y']) {
      const func = `${k}s`;
      const rv = rect[func].call(rect);
      const ov = oriRect[func].call(oriRect);
      const vs = rv.map((v, i) => mask[k][i] ? v : MAX);
      if (vs.filter(v => v !== MAX).length === 0) continue;
      for (const [id, ref] of Object.entries(this.refBounds)) {
        const refs = ref[func].call(ref);
        const v = Constraint.minDist(vs, refs);
        // if (v[0] < 0.1) continue; // 如果距离很小，那可能是已经吸上了，就不要继续锁着了
        if (v[0] < min[k][0]) min[k] = [ ...v, id ];
      }
      const polarDelta = evt.target.reverse({ [k]: min[k][0] }, true);
      // 有可能delta是0，那就当做最大值
      min[k][0] = polarDelta ? polarDelta.r : MAX;
    }

    // x和y, 取移动距离最小的那个（吸附最接近的约束）
    const k = (min.x[0] < min.y[0]) ? 'x' : 'y';
    const r = min[k];

    const setEventDelta = (from, to, fromIdx) => {
      if (from === to) return evt.delta = { x: 0, y: 0 };
      const d = (fromIdx === 0) ? -1 : 1; // 拉伸方向作为符号 left/top: -1 right/bottom: 1
      const p = d * ((to - from > 0) ? 1 : -1);
      const delta = evt.target.reverse({ [k]: d * Math.abs(to - from) });
      if (!delta) return;
      evt.delta = dmap(delta, n => n * p);
      this.hideLine(k === 'x' ? 'y' : 'x'); // 把另外一个线也隐藏了
    }
    this.stick({k, oriRect, rect, r, setEventDelta});
  }

  rotate(evt) {
    const rotation = deg(this.selected.rotation, 2);
    const node = this.selector.selected;
    const to = Math.round(rotation / 90) * 90;
    const k = (to % 180 === 0) ? 'x' : 'y';
    if (Math.abs(rotation % 90) < this.limit * 0.5) {
      const refKey = `rot_${to}`;
      evt.delta = null; // 比较难计算逆运算delta，直接设置了
      if (!this.ref[k] || this.ref[k] !== refKey) {
        this.editor.update([node], { rotation: rad(to) }, this.selector.selectedBox.uuid);
        this.ref[k] = refKey;
        const anchor = this.selector.selectedBox.position;
        const rect = this.selected.bounds().expand(30); // 参考线从边框出头一些
        this.showLine('x', anchor.x, [rect]);
        this.showLine('y', anchor.y, [rect]);
      }
    } else if (this.ref[k]) {
      this.ref[k] = null;
      this.hideAll();
    }
  }

  move(evt) {
    if (!this.selected || !this.selector.selectedBox) return;
    const rect = this.selected.bounds();
    const oriRect = this.selector.selectedBox.bounds();
    const min = { x: [ MAX, null ], y: [ MAX, null ] };
    for (const [id, ref] of Object.entries(this.refBounds)) {
      const { x, y } = Constraint.minDist(rect, ref);
      if (x[0] < min.x[0]) min.x = [ ...x, id ];
      if (y[0] < min.y[0]) min.y = [ ...y, id ];
    }

    for (const [k, r] of Object.entries(min)) { // min: { x, y }
      r[0] *= this.scale;
      const setEventDelta = (from, to) => evt.delta[k] = (to - from) * this.scale;
      this.stick({k, oriRect, rect, r, setEventDelta});
    }
  }

  stick({ k, oriRect, rect, r: [distance, rectIdx, refIdx, refId], setEventDelta }) {
    if (!this.ref) return;
    const applyStick = (k, fromIdx, toIdx, toRect) => {
      const func = `${k}s`;
      const from = fromIdx < 0 ? 0 : oriRect[func].call(oriRect)[fromIdx];
      const to = toIdx < 0 ? 0 : toRect[func].call(toRect)[toIdx];
      setEventDelta(from, to, fromIdx, toIdx);
      return to;
    }

    if (distance < this.limit) {
      const refRect = this.refBounds[refId];
      const refKey = `${rectIdx}_${refIdx}_${refId}`;
      let to;
      if (this.ref[k] && this.ref[k] === refKey) {
        to = applyStick(k, -1, -1);
      } else {
        to = applyStick(k, rectIdx, refIdx, refRect);
        this.hideLine(k); // 原先的要hide
        this.ref[k] = refKey;
      }
      this.showLine(k, to, [oriRect, refRect], (refId === CANVAS) ? CANVAS : null);
    } else if (this.ref[k]) {
      applyStick(k, rectIdx, rectIdx, rect);
      this.hideLine(k);
    }
  }

  showLine(type, val, rects, key=null) {
    const func = (type === 'x') ? 'ys' : 'xs';
    const ns = rects.reduce((a, rect) => rect[func].call(rect, false).concat(a), []);
    const range = [Math.min(...ns), Math.max(...ns)];
    if (!this._controls[type]) {
      const { ctr, scale, canvas } = this;
      this._controls[type] = MiraEditorLine.create({ container: ctr, scale, type, val, range, key, canvas });
    } else {
      this._controls[type].range(range);
    }
    return this;
  }

  hideLine(key) {
    if (this._controls[key]) this._controls[key].remove();
    this._controls[key] = null;
    this.ref[key] = null;
    return this;
  }

  hideAll() {
    Object.keys(this._controls).map(k => this.hideLine(k));
  }

  remove() {
    this.hideAll();
    this.ctr = null;
    if (this.debug_box) this.debug_box.remove();
    this.debug_box = null;
  }

  update(delta) {
    for (const [k, v] of Object.entries(delta)) {
      if (!v) continue; // 如果delta=0，就是没改变
      if (k === 'scale') {
        this.selected.applyScale(1 + v);
      } else {
        this.selected.setConf(k, this.selected.getConf(k) + v);
      }
    }
    if (this.debug_box) this.debug_box.fit(this.scale);
  }

  static minDist(a, b) {
    if (a instanceof DOMRect && b instanceof DOMRect) {
      return { x: this.minDist(a.xs(), b.xs()), y: this.minDist(a.ys(), b.ys())}
    } else if (Array.isArray(a) && Array.isArray(b)) {
      let min = [MAX, -1, -1];
      for (const [i, aa] of a.entries()) {
        for (const [j, bb] of b.entries()) {
          const abs = Math.abs(aa - bb);
          if (abs < min[0]) min = [abs, i, j];
        }
      }
      return min;
    }
  }
}

module.exports = Constraint;