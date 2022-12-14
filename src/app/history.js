import EventEmitter from "eventemitter3";
import Utils from '../util/utils';

export class Record extends EventEmitter {
  constructor(player, senderId) {
    super();
    this.id = Utils.genUuid();
    this.player = player;
    this.time = player.currentTime;
    this.createdTime = Date.now();
    this.updatedTime = this.createdTime;
    // 把时间轴作为senderID，不同时间轴上的修改，不合并
    this.senderId = `${senderId}@${this.time}`;
    this._nodes = {};
    this._attrs = {};
  }

  get nodes() {
    return Object.values(this._nodes).filter(x => !x.destroied);
  }

  get from() {
    return this.getAttrs('from');
  }

  get to() {
    return this.getAttrs('to');
  }

  getAttrs(key) {
    const attrs = {};
    this.nodes.map(node => {
      if (!this._attrs[node.id] || node.destroied) return;
      attrs[node.id] = {};
      for (const [k, v] of Object.entries(this._attrs[node.id])) {
        attrs[node.id][k] = v[key];
      }
    });
    return attrs;
  }

  async revoke() {
    return await this.update(this.nodes, this.from, false);
  }

  async apply() {
    return await this.update(this.nodes, this.to, false);
  }

  async update(nodes, attrs, save=true) {
    if (!Array.isArray(nodes)) {
      if (nodes?.conf) nodes = [nodes];
      else throw new Error('invalid node');
    }

    if (this.player.currentTime != this.time) {
      // 先seek回记录的时间
      await this.player.seekTo(this.time);
    }

    let changed = false;
    const changedNodes = [], changedAttrs = {};
    nodes.map((node) => {
      if (node.destroied) return;
      const _attrs = attrs[node.id] || attrs;
      let changeAttr = {}, nodeChanged = false;
      for (const [k, to] of Object.entries(_attrs)) {
        const from = node.getConf(k, false); // raw data, without unit parse
        // console.log('setConf', node.id, {k, from, to, save});
        if (from === to) continue; // not change
        changeAttr[k] = { from, to };
        // 先不应用，避免一些属性之间更改的依赖
        // node.setConf(k, to); // autounit = true
        changed = nodeChanged = true;
      }

      if (nodeChanged) { // 虚拟node，不保存
        // 保存记录
        if (save && !node.isVirtual) {
          this.updateAttr(node.id, changeAttr);
          this._nodes[node.id] = node;
        }
        changedNodes.push(node);
        changedAttrs[node.id] = changeAttr;
      }
    });

    if (!changed) return false;

    let updates = changedNodes.map(async (node) => {
      const changeAttr = changedAttrs[node.id];

      let entries = Object.entries(changeAttr);
      // enforce key "parent" be the last change between attrs
      if (changeAttr['parent']) {
        entries = [...entries.filter(x => x[0] !== 'parent'), ['parent', changeAttr['parent']]];
      }

      // console.log('update', node.id, changeAttr);
      // set conf
      for (const [k, val] of entries) {
        node.setConf(k, val.to); // autounit = true
      }

      // change resource - reload
      if ((changeAttr['src'] && ['video', 'image', 'audio'].includes(node.type)) || 
          (changeAttr['font'] && node.type === 'text')) {
        node.clearViewCache();
        for (const key of Object.keys(node.conf)) {
          // clear cached key
          if (key.startsWith('cached')) delete node.conf[key];
        }
        // todo: loading progress
        await node.preload();
      }

      // change parent
      if (changeAttr['parent']) node.clearViewCache();
    });
    await Promise.all(updates);

    // 新增/删除/时间改动/zIndex改动，需要重新annotate
    // this.player.rootNode.annotate(this); // 先用后面的？

    // update view after all changes done
    updates = changedNodes.map(async (node) => {
      await node.updateView(this.senderId, changedAttrs[node.id]);
    });
    await Promise.all(updates);

    // 可能updateView也会更改时间，重新annotate一下
    this.player.rootNode.annotate(this);

    return true;
  }

  merge(record) {
    record.nodes.map(node => {
      this._nodes[node.id] = node;
      this.updateAttr(node.id, record._attrs[node.id]);
    });
    this.updatedTime = Date.now();
  }

  updateAttr(nodeId, attrs) {
    if (!this._attrs[nodeId]) this._attrs[nodeId] = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (!this._attrs[nodeId][k]) this._attrs[nodeId][k] = {};
      if (!this._attrs[nodeId][k].hasOwnProperty('from')) {
        this._attrs[nodeId][k].from = v.from;
      }
      this._attrs[nodeId][k].to = v.to;
    }
  }

  isEmpty() {
    return !this.nodes.length || !Object.keys(this.to).length;
  }

  destroy() {
    this.player = null;
    this._nodes = null;
    this._attrs = null;
  }
}

export class History extends EventEmitter {
  static EVENTS = { change: 'change', undo: 'undo', redo: 'redo' };

  constructor() {
    super();
    this._records = [];
    this._index = 0;
  }

  get canUndo() {
    return this._index > 0;
  }

  get canRedo() {
    return this._index < this._records.length;
  }

  append(record) {
    if (record.isEmpty()) return;
    if (this.length > this._index) { // remove future records
      this._records.splice(this._index).map(r => r.destroy());
    }

    const last = this._records[this._index-1];
    if (last && last.senderId === record.senderId) {
      last.merge(record);
      record = last;
    } else {
      this._records.push(record);
      this._index++;
    }

    this.emit(History.EVENTS.change, { record });
    return record;
  }

  async redo(n=1) {
    const record = this._records[this._index];
    if (n <= 0 || !record) return [];
    this._index++;
    await record.apply();
    this.emit(History.EVENTS.redo, { record });
    return [...(await this.redo(n-1)), record];
  }

  async undo(n=1) {
    // todo: 只需要apply最后一个就行了？
    const record = this._records[this._index-1];
    if (n <= 0 || !record) return [];
    this._index--;
    await record.revoke();
    this.emit(History.EVENTS.undo, { record });
    return [...(await this.undo(n-1)), record];
  }

  get length() {
    return this._records.length;
  }

  get currentIndex() {
    return this._index;
  }

  get records() {
    return [...this._records];
  }

  destroy() {
    this._records = null;
  }
}
