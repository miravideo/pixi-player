import React from "react";
import ReactDOM from "react-dom";
import { App } from "./app/index";
import Store from "./app/store";
import { History, Record } from "./app/history";
import Utils from "./app/utils";
import Queue from "./util/queue";
import Editor from "./app/editor";
import { uuid } from "./app/utils/data";

class PlayerUI {
  constructor(container, options) {
    this.container = container;

    // init history
    this._queue = new Queue();
    this._history = new History();
    this._changed = false;

    this.load(options);
    if (options.editable) this.editable(true);

    // observe resize
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.resizing) return;
      this.resizing = true;
      requestAnimationFrame(() => {
        const { width, height } = Utils.innerSize(container);
        if (!this.store) return;
        if (width !== this.width || height !== this.height) {
          this.resize(width, height);
        }
        this.resizing = false;
      });
    });
    this.resizeObserver.observe(container);
  }

  load(options) {
    if (this.store) {
      try {
        this.store.destroy();
      } catch (e) {}
      ReactDOM.unmountComponentAtNode(this.container);
    }

    const { width, height } = Utils.innerSize(this.container);
    options = {width, height, ...(options || {})};
    this.store = new Store(options);
    ReactDOM.render(<App store={this.store}/>, this.container);
    this.store.load();
  }

  toast(msg, durationInMs) {
    this.store.toast(msg, durationInMs);
  }

  showLoading(progress) {
    this.store.showLoading(progress);
  }

  hideLoading() {
    this.store.hideLoading();
  }

  get core() {
    return this.store.player;
  }

  get scale() {
    return this.store.scale;
  }

  resize(width, height) {
    this.store.resize(width, height);
  }

  get width() {
    return this.store.width;
  }

  get height() {
    return this.store.height;
  }

  focus() {
    return this.store.focus();
  }

  on(event, callback) {
    this.core.on(event, callback);
  }

  off(event, callback) {
    this.core.off(event, callback);
  }

  once(event, callback) {
    this.core.once(event, callback);
  }

  get options() {
    return this.store.opt;
  }

  get history() {
    return this._history;
  }

  async _queuedUpdate(update, sync=false) {
    const run = async () => {
      if (!this.history) return;
      const res = await update();
      this._changed = res.changed || this._changed;
      // 如果queue里还有更新任务，就等到最后一起再重绘
      if (!this._queue.length && this._changed) {
        this._changed = false;
        await this.core.render();
      }
      return res;
    }
    return sync ? run() : this._queue.enqueue(run);
  }

  async update(nodes, attrs, senderId, sync) {
    return this._queuedUpdate(async () => {
      senderId = senderId || uuid();
      let record = new Record(this.core, senderId);
      const changed = await record.update(nodes, attrs);
      // return the last record merged this one
      record = this.history.append(record);
      // console.log('update', {record, changed});
      return {record, changed};
    }, sync);
  }

  async redo(n) {
    return this._queuedUpdate(async () => {
      const records = await this.history.redo(n);
      return { records, changed: records.length > 0 };
    });
  }

  async undo(n) {
    return this._queuedUpdate(async () => {
      const records = await this.history.undo(n);
      return { records, changed: records.length > 0 };
    });
  }

  editable(enable) {
    this.store.editable(enable);
    if (!this.editor) this.editor = new Editor(this);
  }

  enableKeyboard(enable) {
    this.store.opt.enableKeyboard = enable;
  }

  getNodeById(id) {
    return this.core.getNodeById(id);
  }

  get version() {
    return this.store.version;
  }

  get editorContainer() {
    return this.store.editorRef.current;
  }

  get canvas() {
    return this.store.canvasRef.current;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = null;
    if (this.store) this.store.destroy();
    this.store = null;
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    if (this._history) this._history.destroy();
    this._history = null;
    if (this._queue) this._queue.destroy();
    this._queue = null;
    if (this.editor) this.editor.destroy();
    this.editor = null;
  }
}

const PixiPlayer = global['pixi-player'];
if (!PixiPlayer['init']) {
  PixiPlayer['init'] = (container, options) => {
    return new PlayerUI(container, options);
  }
}

export default PixiPlayer
