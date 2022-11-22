'use strict';

const { HOVER, SELECT, CHANGING, CHANGED, RESIZE, OP_ADD, OP_DELETE, OP_END, MAX } = require('../utils/static');
const MiraEditorBox = require('../views/select-view');
const BaseControl = require('./base');
const NodeGroup = require('./group');

const MULTI_KEYS = ['Meta', 'Control'];

class Select extends BaseControl {
  static type = "select";
  constructor(editor) {
    super(editor);
    this.hoverId = null;
    this.hoverBox = null;
    this.selected = null;
    this.selectedBox = null;
  }

  get cropMode() {
    return this.editor.opts?.cropMode === 'frame'
     || this.editor.creator?.conf?.cropMode === 'frame';
  }

  events() {
    return {
      // keydown: this.onKeyDown(), keyup: this.onKeyUp(), enable: this.onEnable(),
      // [CHANGED]: this.onChanged(), [CHANGING]: this.onChanging(),
      [RESIZE]: this.onResize(), 
      [SELECT]: this.onSelect(),
      [HOVER]: this.onHover(), 
    };
  }

  hideAll() {
    this.hideSelect();
    this.hideHover();
  }

  onKey(key, evt) {
    // do nothing
  }

  onKeyDown() {
    return (evt) => {
      const lockKey = 'keyboard';
      if (MULTI_KEYS.includes(evt.key)) return this.enableMulti(true);
      const key = `${evt.key}`.toLowerCase();
      const canRespond = this.editor.responder === this.constructor.type;
      if (this.locked(lockKey)) return evt.preventDefault();
      if (evt.mctrlKey && key === 'c' && canRespond) {
        this.copy();
      } else if (evt.mctrlKey && key === 'v' && canRespond) {
        this.paste();
      } else if (evt.key === 'Backspace' && canRespond) {
        this.delete(this.selected);
      } else {
        return this.onKey(key, evt);
      }
      this.lock(100, null, lockKey);
      evt.preventDefault();
    }
  }

  onKeyUp() {
    return (evt) => {
      if (MULTI_KEYS.includes(evt.key)) this.enableMulti(false);
      const key = `${evt.key}`.toLowerCase();
      this.onKey(key, evt);
    }
  }

  enableMulti(enable) {
    // 这个方法是给hook用的
    this.withMulti = enable;
  }

  onHover() {
    return (evt) => {
      if (this.changing) return;
      (evt.type === 'mouseout') ? this.hideHover() : this.showHover(evt.target, evt);
    }
  }

  onResize() {
    return () => this.fit();
  }

  onSelect() {
    return (evt) => {
      const node = evt?.target;
      if (!node) return this.hideAll();
      // if (this.constructor.type === 'select' && !node?.display) {
      //   return;
      // }
      let selected;
      if (this.withMulti || evt.action === 'multi' || (node && node.groupId && node.groupId != 'NULL')) {
        if (Array.isArray(evt.nodes) && evt.nodes.length > 0) {
          for (const n of evt.nodes) {
            selected = this.multiSelect(n, selected);
          }
        } else {
          selected = this.multiSelect(node);
        }
      } else {
        selected = node;
      }
      this.showSelect(selected, evt);
    }
  }

  multiSelect(node, selected) {
    selected = selected || this.selected;
    if (!node?.type || node.type === 'creator') return;
    if (selected instanceof NodeGroup) {
      return selected.toggleNode(node);
    }
    if (node.groupId && node.groupId !== 'NULL') {
      return new NodeGroup(node);
    } else if (selected && selected.id !== node.id) {
      return new NodeGroup([selected, node]);
    }
    return node;
  }

  toggleSelect() {
    // 多选不容易，点击就不要unselect了
    if (this.selected instanceof NodeGroup) return this.hideHover();
    if (this.toggleSelectedId === this.selected?.id) {
      this.toggleSelectedId = null;
      this.hideSelect();
    } else if (this.selected) {
      this.toggleSelectedId = this.selected.id;
      this.hideHover();
    }
  }

  hideSelect() {
    if (this.selected?.cropMode === 'frame') {
      if (this.constructor.type === 'select' && !this.cropMode) {
        // 如果是frame的裁剪模式，就退出
        this.selected.cropMode = false;
      } else {
        return;
      }
    }
    if (this.selectedBox) this.selectedBox.remove();
    if (this.selected instanceof NodeGroup) {
      this.selected.addEventsTo(this.editor, false);
      if (!this.selected.nodes) this.selected.destroy();
    }
    this.selectedBox = null;
    this.selected = null;
    this.toggleSelectedId = null;
  }

  showSelect(selected, evt) {
    if (this.cropMode) {
      if (selected) selected.cropMode = 'frame';
      else return;
    }
    this.hideSelect();
    if (!selected?.type) return;
    // 允许编辑代理node
    if (selected && this.constructor.type === 'select' && selected.canvasEditNode) {
      selected = selected.canvasEditNode;
    }
    this.selected = selected;
    if (this.selected.addEventsTo) { // for group
      this.selected.addEventsTo(this.editor, true);
    }
    this.selectedBox = this.createBox(selected, true);
    if (selected instanceof NodeGroup) {
      selected.appendTo(this.selectedBox);
    }
    // console.log(`${this.constructor.name}.showSelect`, this.selected);
    return this.selected;
  }

  hideHover() {
    this.hoverId = null;
    if (this.hoverBox) {
      this.hoverBox.remove();
      this.hoverBox = null;
    }
  }

  showHover(node, evt) {
    if (!node?.type) return;
    if (this.hoverId || this.hoverBox) this.hideHover();
    this.hoverBox = this.createBox(node, false);
    if (this.hoverBox) this.hoverId = node.id;
  }

  createBox(node, selected=false) {
    if (!this.container || !this.editor) return;
    const { container } = this;
    const { scale } = this.editor;
    return MiraEditorBox.create({node, scale, container, selected});
  }

  fit(ani=false) {
    this.hideHover();
    const { scale } = this.editor;
    if (this.selected?.fit) this.selected.fit(scale);
    if (this.selectedBox) {
      if (this.selected.onTime()) {
        if (ani) this.selectedBox.addClass('ani', 300);
        this.selectedBox.fit(scale);
      } else {
        this.hideSelect();
      }
    }
  }

  destroy() {
    super.destroy();
    this.hideHover();
    this.hideSelect();
  }
}

module.exports = Select;
