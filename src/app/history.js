import EventEmitter from "eventemitter3";
import Utils from '../util/utils';

export class Record extends EventEmitter {
  constructor(senderId) {
    super();
    this.id = Utils.genUuid();
    this.senderId = senderId;
    this._nodes = {};
    this._attrs = {};
  }

  get nodes() {
    return Object.values(this._nodes);
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
      if (!this._attrs[node.id]) return;
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

    let changed = false;
    const updates = nodes.map(async (node) => {
      const _attrs = attrs[node.id] || attrs;
      let changeAttr = {}, nodeChanged = false;
      for (const [k, to] of Object.entries(_attrs)) {
        const from = node.getConf(k, false); // raw data, without unit parse
        // console.log('setConf', node.id, {k, from, to, save});
        if (from === to) continue; // not change
        changeAttr[k] = { from, to };
        node.setConf(k, to); // autounit = true
        changed = nodeChanged = true;
      }
      if (nodeChanged) {
        // todo: 修改了src/font等属性，需要重新preload!
        // todo: 不能随便清view缓存，否则会不断的新建view，绑定事件
        // node.clearViewCache();
        await node.updateView(this.senderId);

        // 虚拟node，不保存
        if (node.isVirtual) return;
        // 保存记录
        if (save) this.updateAttr(node.id, changeAttr);
        this._nodes[node.id] = node;
      }
    });
    await Promise.all(updates);
    return changed;
  }

  merge(record) {
    record.nodes.map(node => {
      this._nodes[node.id] = node;
      this.updateAttr(node.id, record._attrs[node.id]);
    });
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

  append(record) {
    if (record.isEmpty()) return;
    if (this.length > this._index) { // remove future records
      this._records.splice(this._index).map(r => r.destroy());
    }

    record.time = Date.now();
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
