'use strict';

const { uuid } = require('../utils/data');
const { HOVER, SELECT, HISTORY, RESIZE, MAX, KEYDOWN, KEYUP } = require('../utils/static');
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
    // 画幅不动的crop
    return this.editor.cropMode === 'frame';
  }

  events() {
    return {
      [KEYDOWN]: this.onKeyDown(), [KEYUP]: this.onKeyUp(),
      // [CHANGED]: this.onChanged(), [CHANGING]: this.onChanging(),
      [RESIZE]: this.onResize(), 
      [SELECT]: this.onSelect(),
      [HOVER]: this.onHover(), 
      [HISTORY]: this.onHistoryChange(),
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
      // 文字编辑模式下，不响应这些事件了
      if (this.editor.controls.move.editMode) return;
      const lockKey = 'keyboard';
      if (MULTI_KEYS.includes(evt.key)) return this.enableMulti(true);
      const key = `${evt.key}`.toLowerCase();
      const canRespond = true;//this.editor.responder === this.constructor.type;
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

  onHistoryChange() {
    return (evt) => {
      if (!Array.isArray(evt.records) || !evt.records.length || this.editor.controls.move.editMode) return;
      this.hideHover();
      const nodes = evt.records[0].nodes;
      let node = nodes.length > 1 ? new NodeGroup(this.editor, nodes) : nodes[0];
      if (node.groupId) node = this.multiSelect(node);
      if (node.parent) this.showSelect(node);
    }
  }

  enableMulti(enable) {
    // 这个方法是给hook用的, 比如在多选状态下，隐藏move控件，可以再多选到背景挡住的元素
    this.withMulti = enable;
  }

  onHover() {
    return (evt) => {
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
      if (this.withMulti || evt.action === 'multi') {
        selected = this.selected; // 用已经选中的作为初始
        if (node && node.groupId && selected.type === 'group' 
          && selected.groupLocked && selected.nodes[node.id]) {
          // 如果按住ctrl，可以单独选择一个已经锁定的组内元素
          selected = node;
        } else {
          if (Array.isArray(evt.nodes) && evt.nodes.length > 0) {
            for (const n of evt.nodes) {
              selected = this.multiSelect(n, selected);
            }
          } else {
            selected = this.multiSelect(node, selected);
          }
        }
      } else if (node && node.groupId) {
        selected = this.multiSelect(node);
      } else {
        selected = node;
      }
      this.showSelect(selected, evt);
    }
  }

  multiSelect(node, selected) {
    if (!node?.type || node.type === 'canvas') return;
    if (selected instanceof NodeGroup) {
      return selected.toggleNode(node);
    }
    let groupNode;
    if (node.groupId) {
      groupNode = new NodeGroup(this.editor, node);
    } else if (selected && selected.id !== node.id) {
      groupNode = new NodeGroup(this.editor, [selected, node]);
    }
    return (groupNode && Object.values(groupNode.nodes).length > 1) ? groupNode : node;
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

  showSelect(selected) {
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

  copy() {
    this.editor.copyNode = this.selected;
    if (this.selectedBox?.addClass) this.selectedBox.addClass('copy', 300);
  }

  async paste(src, opts={}) {
    src = src || this.editor.copyNode;
    if (!src) return;
    let { emitEnd=true, nodes=null, track, time, senderId } = opts;
    nodes = nodes || {};

    if (emitEnd) {
      senderId = uuid();
      this.editor.showLoading(0.01);
    }

    const copyChild = async (children, parent, srcId) => {
      const _opt = { emitEnd:false, senderId, nodes: {[srcId]:parent} };
      await this.paste(new NodeGroup(children), _opt);
    }

    const applyPaste = async (sn) => {
      const node = await this.editor.cloneNode(sn);
      nodes[sn.id] = node;

      let parent = sn.parent;
      // track内的节点复制，不要复制到track里，不然时间对不上，看上去就没效果
      if (parent.isTrack) parent = this.editor.rootNode;
      const to = { zIndex: sn.zIndex, parent };

      // 位置偏移一点
      // let [x, y] = [sn.getConf('x'), sn.getConf('y')];
      // to.x = x + 30, to.y = y + 30;

      // if (sn.nextSibling) to.nextSibling = sn.nextSibling;
      // 若parent也在本次复制之列，保持复制后的关系
      if (nodes[sn.parent.id]) to.parent = nodes[sn.parent.id];
      if (offset !== 0 && !nodes[sn.parent.id] && sn.parent.type !== 'spine') {
        to.start = Math.max(0, sn.startTime + offset);
      }
      to.trackId = track ? track.id : sn.trackId;

      // Select.apply(node, { to }, action);
      // todo: 合并到一起提交
      await this.editor.update([node], to, senderId);

      if (sn.type === 'scene') {
        await copyChild(sn.allNodes, node, sn.id);
      } else if (sn.type === 'text' && sn.speech) {
        await copyChild(sn.speech, node, sn.id);
      }
    }

    let offset = 0;
    if (src.nodes) {
      const srcNodes = Object.values(src.nodes);
      // 如果目标轨道本身就是当前复制源node的轨道，那就都不动
      if (srcNodes.map(n => n.trackId).includes(track?.id)) {
        track = null;
      }

      if (emitEnd && time) { // todo: emitEnd只是来判断是否是"根"复制
        // 把最早的node的时间，移到当前时间
        let minStartTime = MAX;
        srcNodes.map(n => minStartTime = Math.min(n.absStartTime, minStartTime));
        offset = time - minStartTime;
      }

      // 根节点在前，先复制
      srcNodes.sort((a, b) => a.parents.length - b.parents.length);
      for (const sn of srcNodes) {
        await applyPaste(sn);
      }
    } else {
      // todo: emitEnd只是来判断是否是"根"复制
      if (emitEnd && time) offset = time - src.absStartTime;
      await applyPaste(src);
    }
    if (emitEnd) {
      this.editor.hideLoading();
      this.editor.toast('Copied!', 1000);
    }
    return nodes;
  }

  delete(node, deselect=true) {
    if (!node) return;
    const senderId = uuid();
    const nodes = [], changes = {};
    const deleteNode = (node) => {
      if (node.children.length > 0) {
        if (['scene', 'cover'].includes(node.type)) { // 移除所有各级子节点
          const to = { parent: null };
          node.allNodes.map(x => {
            nodes[x.id] = x;
            changes[x.id] = to;
            // this.editor.update([x], to, senderId);
          });
        } else if (node.type === 'text' && node.speech) { // text下面的speech要删掉
          const to = { parent: null };
          node.children.filter(x => x.type === 'speech').map(x => {
            nodes[x.id] = x;
            changes[x.id] = to;
            // this.editor.update([x], to, senderId);
          });
        } else { // 把自己的children给parent
          const isInTrack = ['spine', 'track'].includes(node.parent.type);
          const parent = isInTrack ? this.editor.rootNode : node.parent;
          node.children.map(x => {
            const to = { parent };
            to.start = x.startTime + node.startTime;
            if (x.conf.end) to.end = x.endTime + node.startTime;
            nodes[x.id] = x;
            changes[x.id] = to;
            // this.editor.update([x], to, senderId);
          });
        }
      }

      const to = { prevSibling: null, nextSibling: null, parent: null };
      // remove next trans
      if (node.type !== 'trans') {
        if (!node.nextSibling && node.prevSibling?.type === 'trans') deleteNode(node.prevSibling);
        if (node.nextSibling?.type === 'trans') deleteNode(node.nextSibling);
      }

      nodes[node.id] = node;
      changes[node.id] = to;
    }

    if (node.nodes) {
      const nodes = Object.values(node.nodes);
      // 根节点在前，先删除/恢复
      nodes.sort((a, b) => a.parents.length - b.parents.length);
      nodes.map(n => deleteNode(n));
    } else {
      deleteNode(node);
    }

    // update
    this.editor.update(Object.values(nodes), changes, senderId);

    if (deselect) {
      this.hideSelect(); // 必须先删再hide, 不然group可能已经destroy了
      // this.editor.hideSelect();
    }
  }

  destroy() {
    super.destroy();
    this.hideHover();
    this.hideSelect();
  }
}

module.exports = Select;
