'use strict';

const Node = require('./node');
const MiraEditorBox = require('../views/select-view');
const { deg } = require('../utils/math');
const Rect = require('../utils/rect');
const Move = require('./move');
const Rotate = require('./rotate');
const Resize = require('./resize');
const BaseControl = require('./base');
const { MAX } = require('../utils/static');
const Point = require('../utils/point');

class NodeGroup extends Node {
  constructor(nodes) {
    super({type: 'group'});
    this.visible = true; // always visible??
    this.nodes = {};
    this.boxes = {};
    this.initContainer();
    if (Array.isArray(nodes)) nodes.map(node => this.toggleNode(node));
    else if (typeof nodes === 'object') this.toggleNode(nodes);
  }

  creator() {
    return Object.values(this.nodes)[0].creator();
  }

  initContainer() {
    this.container = document.createElement('div');
    this.container.setAttribute('mira-editor-el', '');
    this.container.classList.add('mira-editor-group');
  }

  appendTo(container) {
    container.classList.add('group');
    container.append(this.container);
    this.fit(container.scale);
  }

  fit(scale) {
    if (scale !== undefined) {
      this.scale = scale;
      Object.values(this.boxes).map(o => o && o.fit(scale));
      this._dirty_ = true;
    }

    // offset container to (0, 0) for children position base on
    const { size: [w, h], position } = this.metrcs();
    const { x, y } = (new Point(position)).scale(- this.scale).rotate(- this._rotation);
    const _deg = deg(- this._rotation, 1);
    this.container.style.transform = `translate(${x}px, ${y}px) rotate(${_deg}deg)`;
    return this;
  }

  createBox(node) {
    const { scale, container } = this;
    if (!node.getAnchor) return null;
    return MiraEditorBox.create({node, container, scale, selected: false });
  }

  toggleNode(node) {
    if (this.groupSelect(node)) {
      Object.values(this.nodes).map(n => {
        if (this.boxes[n.id]) return;
        this.boxes[n.id] = this.createBox(n);
      });
    } else if (this.nodes[node.id]) {
      this.boxes[node.id]?.remove();
      delete this.nodes[node.id];
      delete this.boxes[node.id];
      const remains = Object.values(this.nodes);
      if (remains.length === 1) {
        // 只剩一个的时候，就不要group了
        this.boxes[remains[0].id]?.remove();
        this.boxes = null;
        this.nodes = null;
        return remains[0];
      }
    } else {
      this.nodes[node.id] = node;
      this.boxes[node.id] = this.createBox(node);
    }
    this._dirty_ = true;
    return this;
  }

  setRotate(rotation) {
    const delta = rotation - this._rotation;
    this._rotation = rotation;
    const anchor = this.metrcs().position;
    Object.values(this.nodes).map(node => {
      const box = this.boxes[node.id];
      if (!box) return;
      const bp = box.position.rebase(anchor);
      const { x, y } = bp.rotate(delta).rebase(bp);
      const deltaAction = { rotation: delta, position: { x, y } };
      BaseControl.apply(node, deltaAction, 'group-rotate');
      box.move().rotate();
    });
    return this.fit();
  }

  setXY(x, y) {
    x -= this.getX();
    y -= this.getY();
    Object.values(this.nodes).map(node => {
      Move.apply(node, { position: {x, y} });
      this.boxes[node.id]?.move();
    });
    this._metrcs_.position[0] += x;
    this._metrcs_.position[1] += y;
    return this.fit();
  }

  setWH(w, h) {
    const [ oriWidth, oriHeight ] = this.getWH();
    w -= oriWidth;
    h -= oriHeight;
    let scale = { x: w / oriWidth, y: h / oriHeight };
    if (scale.x > 0 && scale.y > 0) {
      // 2个轴都在动，一定是等比例拉伸
      scale.x = scale.y = Math.max(scale.x, scale.y);
    }

    const anchor = this.metrcs().position;
    Object.values(this.nodes).map(node => {
      const box = this.boxes[node.id];
      if (!box) return;
      const delta = {
        size: { width: box.size.width * scale.x, height: box.size.height * scale.y },
        position: box.position.rebase(anchor).scale(scale),
      };
      Resize.apply(node, delta);
      this.boxes[node.id].resize();
    });
    this._metrcs_.size[0] += w;
    this._metrcs_.size[1] += h;
    return this;
  }

  metrcs() {
    if (!this._dirty_) return this._metrcs_;
    this._metrcs_ = { };

    const bounds = { top: MAX, left: MAX, bottom: 0, right: 0 };
    for (const box of Object.values(this.boxes)) {
      if (!box) continue;
      const { top, bottom, left, right } = box.bounds();
      // console.log('bounds', { top, bottom, left, right });
      bounds.top =    Math.min(bounds.top,    top);
      bounds.bottom = Math.max(bounds.bottom, bottom);
      bounds.left =   Math.min(bounds.left,   left);
      bounds.right =  Math.max(bounds.right,  right);
    }
    const rect = Rect.from(bounds);
    // console.log('rect', rect, bounds);

    const { x, y } = rect.center;
    this._metrcs_.size = [ rect.width + 2, rect.height + 2 ];
    this._metrcs_.position = [ x, y ];

    // console.log('this._metrcs_', this._metrcs_);
    this._dirty_ = false;
    return this._metrcs_;
  }

  destroy() {
    super.destroy();
    this.nodes = null;
    this.boxes = null;
  }
}

module.exports = NodeGroup;
