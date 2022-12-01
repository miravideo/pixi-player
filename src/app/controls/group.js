'use strict';

const Node = require('./node');
const MiraEditorBox = require('../views/select-view');
const { deg } = require('../utils/math');
const Rect = require('../utils/rect');
const { MAX } = require('../utils/static');
const Point = require('../utils/point');
const { uuid } = require('../utils/data');

class NodeGroup extends Node {
  constructor(editor, nodes) {
    super({type: 'group'});
    this.editor = editor;
    // this.visible = true; // always visible??
    this.isVirtual = true;
    this.nodes = {};
    this.boxes = {};
    this.initContainer();
    if (Array.isArray(nodes)) nodes.map(node => this.toggleNode(node));
    else if (typeof nodes === 'object') this.toggleNode(nodes);
  }

  get player() {
    return this.editor.player.core;
  }

  get groupLocked() {
    const nodes = Object.values(this.nodes);
    const groupId = nodes[0]?.groupId;
    return nodes.length > 1 && groupId && nodes.every(n => n.groupId === groupId);
  }

  async lock(lock=true) {
    if (!this.lockId) this.lockId = uuid();
    const groupId = lock ? this.lockId : undefined;
    const srcGroupId = lock ? undefined : this.lockId;
    const nodes = Object.values(this.nodes);
    await this.editor.update(nodes, { groupId, srcGroupId }, this.lockId);
  }

  root() {
    return this.editor.rootNode;
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
    if (!node.getView()) return null;
    return MiraEditorBox.create({node, container, scale, selected: false });
  }

  toggleNode(node) {
    if (this.groupSelect(node)) {
      Object.values(this.nodes).map(n => {
        // 如果已经有了，就移出重新画，更新box状态（比如之前在编辑状态，现在退出了）
        if (this.boxes[n.id]) this.boxes[n.id].remove();
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

  setConf(key, value) {
    if (!this._change) this._change = {};
    this._change[key] = value;
  }

  async updateView(senderId) {
    if (!this._change) return;

    let rotationDelta, positionDelta, scaleDelta;
    if (this._change.rotation !== undefined) {
      rotationDelta = this._change.rotation - this.rotation;
      this._rotation = this._change.rotation;
    }

    if (this._change.x !== undefined || this._change.y !== undefined) {
      const [x, y] = [this._change.x || this.x, this._change.y || this.y];
      positionDelta = { x: x - this.x, y: y - this.y };
      this._metrcs_.position[0] = x;
      this._metrcs_.position[1] = y;
    }

    if (this._change.width !== undefined || this._change.height !== undefined) {
      const [w, h] = [this._change.width || this.width, this._change.height || this.height];
      const sizeDelta = { w: w - this.width, h: h - this.height };
      scaleDelta = { x: sizeDelta.w / this.width, y: sizeDelta.h / this.height };
      if (scaleDelta.x !== 0 && scaleDelta.y !== 0) {
        // 2个轴都在动，一定是等比例拉伸，故统一
        scaleDelta.x = scaleDelta.y = Math.max(scaleDelta.x, scaleDelta.y);
      }
      this._metrcs_.size[0] = w;
      this._metrcs_.size[1] = h;
    }

    const anchor = this.metrcs().position;
    const nodes = [];
    const attrs = {};
    Object.values(this.nodes).map((node) => {
      const box = this.boxes[node.id];
      if (!box) return;
      const delta = {}, attr = {};
      if (rotationDelta) {
        const bp = box.position.rebase(anchor);
        const { x, y } = bp.rotate(rotationDelta).rebase(bp);
        Object.assign(delta, { rotation: rotationDelta, x, y });
      }

      if (scaleDelta) {
        const _positionDelta = box.position.rebase(anchor).scale(scaleDelta);
        delta.x = (delta.x || 0) + _positionDelta.x;
        delta.y = (delta.y || 0) + _positionDelta.y;
        // 统一只改scale

        if (node.type === 'text') {
          delta.width = box.size.width * scaleDelta.x;
          delta.height = box.size.height * scaleDelta.y;
          // text高度变了，就把font-size也一起变了(等比例)
          attr.fontSize = node.fontSize * (1 + scaleDelta.y);
          // 如果原先没有height，也不要设置
          if (!node.conf.height) delete delta.height;
        } else {
          delta.scale = Math.max(scaleDelta.x, scaleDelta.y);
        }

        // todo: _positionDelta需要矫正，否则不断拉伸会一直漂移。。。
      }

      if (positionDelta) {
        delta.x = (delta.x || 0) + positionDelta.x;
        delta.y = (delta.y || 0) + positionDelta.y;
      }

      if (Object.values(delta).filter(v => v !== 0).length > 0) {
        nodes.push(node);
        attrs[node.id] = this.editor.getViewAttr(node, delta);
        Object.assign(attrs[node.id], attr);
      }
    });

    if (nodes.length > 0) {
      // sync = true, 因为group本身已经在queue里调用了
      await this.editor.update(nodes, attrs, senderId, true);
      Object.values(nodes).map((node) => {
        const box = this.boxes[node.id];
        // update box
        if (box) box.rotate().resize();
      });
    }

    this._change = null;
    this.fit();
  }

  metrcs() {
    if (!this._dirty_) return this._metrcs_;
    this._metrcs_ = { };
    this._rotation = 0; // todo: 不要重置，而是根据_rotation修改box.bounds() ?

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

  onTime() {
    return Object.values(this.nodes).every(n => n.onTime());
  }

  destroy() {
    super.destroy();
    this.nodes = null;
    this.boxes = null;
    this.editor = null;
  }
}

module.exports = NodeGroup;
