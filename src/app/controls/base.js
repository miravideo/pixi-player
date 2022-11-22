'use strict';

const { zip } = require('../utils/data');
const EventEmitter = require('../utils/event');
const { sum, round } = require('../utils/math');
const { wrap } = require('../utils/plugin');
const { uuid } = require('../utils/data');
const Point = require('../utils/point');
const { CHANGING, TYPE_PLACEHOLDER, OP_CLEAR_CACHE } = require('../utils/static');

class BaseControl extends EventEmitter {
  static type = "base";
  constructor(editor) {
    super();
    this.id = uuid();
    this.lockTimer = {};
    this._wrappers = [];
    this.editor = editor;
    this.bindEvents(true);
  }

  get container() {
    return this.editor.container;
  }

  toast(msg, durationInMs) {
    if (this.editor) this.editor.toast(msg, durationInMs);
    return this;
  }

  lock(duration, callback, key='default') {
    if (this.lockTimer[key]) {
      clearTimeout(this.lockTimer[key]);
      this.lockTimer[key] = null;
    }
    this.lockTimer[key] = setTimeout(() => {
      this.lockTimer[key] = null;
      if (callback) callback();
    }, duration);
    return this;
  }

  locked(key='default') {
    return !!this.lockTimer[key];
  }

  wrap(obj, funcName) {
    const wrapper = wrap(obj, funcName);
    this._wrappers.push(wrapper);
    return wrapper;
  }

  events() {
    return {};
  }

  canvasCoord(xy, scale=1) {
    const rect = this.editor.canvas.getBoundingClientRect();
    return new Point(xy.position ? xy.position : xy).rebase(rect).scale(scale);
  }

  cachedEvents() {
    if (this.cacheEvents) return this.cacheEvents;
    return this.cacheEvents = this.events();
  }

  bindEvents(on) {
    for (const [name, callback] of Object.entries(this.cachedEvents())) {
      on ? this.editor.on(name, callback) : this.editor.off(name, callback);
    }
  }

  getAttrs(delta) {
    return delta;
  }

  async update(nodes, delta) {
    return await this.editor.update(nodes, this.getAttrs(delta), this.id);
  }

  destroy() {
    if (this.cacheEvents) this.bindEvents(false);
    if (this._wrappers) this._wrappers.map(wrapper => wrapper.revoke());
    if (this.lockTimer) {
      Object.values(this.lockTimer).map(timer => timer && clearTimeout(timer));
    }
    this.editor = null;
    this.cacheEvents = null;
    this._wrappers = null;
    this.lockTimer = null;
  }
}

module.exports = BaseControl;
