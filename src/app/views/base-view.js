'use strict';

const { uuid } = require('../utils/data');
const { norm2d } = require('../utils/math');

class MiraEditorBase extends HTMLElement {
  static TAG = 'div';
  constructor() {
    super();
    this.lockTimer = {};
    this.uuid = uuid();
  }

  scrollToVisible(opts={center: false, top: false, smooth: true}) {
    if (typeof(opts) === 'boolean') opts = { center: !!opts, top: false, smooth: true };
    const behavior = opts.smooth ? 'smooth' : 'auto';
    const x = opts.center ? 'center' : 'nearest';
    const y = opts.top ? 'center' : 'nearest';
    this.scrollIntoView({ behavior, block: y, inline: x });
    return this;
  }

  clear() {
    if (!this.dragstart) return;
    this.dragstart = false;
    if (this.moveListener && this.moveListener.onMoveEnd) {
      this.moveListener.onMoveEnd({ target: this, position: { x: 0, y: 0 }, moved: this.moved > 5, event: null });
    }
  }

  locked(key='default') {
    return !!this.lockTimer[key];
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

  get(key) {
    return this.getAttribute(key);
  }

  set(key, value) {
    this.setAttribute(key, value);
    return this;
  }

  show(isShow) {
    return isShow ? this.removeClass('hide') : this.addClass('hide');
  }

  setStyleVars(vars={}) {
    for (const [key, value] of Object.entries(vars)) {
      this.style.setProperty(key, value);
    }
    return this;
  }

  setStyle(styles={}) {
    return this.setAttr('style', styles);
  }

  setAttr(attr, values={}) {
    for (const [key, value] of Object.entries(values)) {
      this[attr][key] = value;
    }
    return this;
  }

  toggleClass(klass, on=null) {
    if (on === null) on = !this.classList.contains(klass);
    on ? this.addClass(klass) : this.removeClass(klass);
    return on;
  }

  addClass(klass, duration) {
    if (!Array.isArray(klass)) klass = [klass];
    this.classList.add(...klass);
    if (duration > 0) this.lock(duration, () => this.removeClass(klass), `class.${klass}`);
    return this;
  }

  removeClass(klass) {
    if (!Array.isArray(klass)) klass = [klass];
    this.classList.remove(...klass);
    return this;
  }

  hasClass(klass) {
    if (!Array.isArray(klass)) klass = [klass];
    return klass.filter(x => this.classList.contains(x)).length > 0;
  }

  appendTo(container) {
    if (container) container.append(this);
    return this;
  }

  remove() {
    if (this.cbs) this.bindEvents(false);
    Object.values(this.lockTimer).map(timer => timer && clearTimeout(timer));
    this.lockTimer = {};
    this.onClick = null;
    this.moveListener = null;
    super.remove();
  }

  hide() {
    super.remove();
  }

  onDragStart() {
    return (event) => {
      if (this.dragstart || event.button !== 0) return;
      this.bindBodyEvents(true);
      event.stopPropagation();
      this.dragstart = true;
      this.moved = 0;
      const { clientX: x, clientY: y } = event;
      this.lastPosition = { x, y };
      if (this.moveListener && this.moveListener.onMoveStart) {
        this.moveListener.onMoveStart({ target: this, position: this.lastPosition, event });
      }
    };
  }

  onDragMove() {
    return (event) => {
      const { clientX: x, clientY: y } = event;
      const position = { x, y };
      if (this.moveListener && this.moveListener.onCursor) {
        this.moveListener.onCursor({ target: this, position, event });
      }

      // console.log('onDragMove', this, this.dragstart);
      if (!this.dragstart) return false;
      event.stopPropagation();
      const { x: lastX, y: lastY } = this.lastPosition;
      this.move = { x: x - lastX, y: y - lastY };
      this.moved += norm2d(this.move);
      this.lastPosition = position;
      if (this.moveListener && this.moveListener.onMove
         && (this.move.x !== 0 || this.move.y !== 0)) {
        this.moveListener.onMove({ target: this, position, moved: this.moved > 5, delta: this.move, event });
      }
    }
  }

  onDragEnd() {
    return (event) => {
      if (!this.dragstart) return false;
      event.stopPropagation();
      this.bindBodyEvents(false);
      this.dragstart = false;
      this.move = null;
      this.lastPosition = null;
      const { clientX: x, clientY: y } = event;

      if (this.moved <= 5) {
        const now = Date.now();
        if (this.moveListener?.onDblClick && this.lastClickTime && now - this.lastClickTime < 600) {
          const { clientX: x, clientY: y } = event;
          this.moveListener.onDblClick({ target: this, position: { x, y }, event });
        }
        if (this.onClick) this.onClick(event);
        this.lastClickTime = now;
      }

      // 时序上，先把onClick/onDblClick触发了
      if (this.moveListener?.onMoveEnd) {
        this.moveListener.onMoveEnd({ target: this, position: { x, y }, moved: this.moved > 5, event });
      }
    }
  }

  onHover() {
    return (event) => {
      if (this.moveListener && this.moveListener.onHover) {
        const { clientX: x, clientY: y } = event;
        this.moveListener.onHover({ target: this, position: { x, y }, 
          drag: this.dragstart, moved: this.moved, event });
      }
      this.toggleClass('hover', event.type === 'mouseover');
    }
  }

  onDblClick() {
    return (event) => {
      if (this.moveListener && this.moveListener.onDblClick) {
        const { clientX: x, clientY: y } = event;
        this.moveListener.onDblClick({ target: this, position: { x, y }, event });
      }
    }
  }

  addMoveListener(listener) {
    this.moveListener = listener;
    if (!this.cbs) this.bindEvents();
    return this;
  }

  events() {
    return { hover: ['mouseover', 'mouseout'],
             start: ['mousedown', 'touchstart'],
             move: ['mousemove', 'touchmove'],
             end: ['mouseup', 'mouseupoutside', 'touchend', 'touchendoutside'],
             dblclick: ['dblclick']};
  }

  eventCallbacks() {
    return { hover: this.onHover(), dblclick: this.onDblClick(),
      start: this.onDragStart(), move: this.onDragMove(), end: this.onDragEnd() };
  }

  bindEvents(on=true) {
    if (on) this.cbs = this.eventCallbacks();
    for (const [type, evts] of Object.entries(this.events())) {
      const callback = this.cbs[type];
      for (const evt of evts) {
        on ? this.addEventListener(evt, callback) : this.removeEventListener(evt, callback);
      }
    }
    if (!on) this.cbs = null;
  }

  bindBodyEvents(on=true, types=['move', 'end']) {
    if (!this.cbs) return;
    const events = this.events();
    for (const type of types) {
      for (const evt of events[type]) {
        on ? document.body.addEventListener(evt, this.cbs[type])
         : document.body.removeEventListener(evt, this.cbs[type]);
      }
    }
  }

  init() {
    this.setAttribute('mira-editor-el', '');
    return this;
  }

  static create(parentNode) {
    return document.createElement(this.TAG).init().appendTo(parentNode);
  }

  static register() {
    if (customElements.get(this.TAG)) return;
    customElements.define(this.TAG, this);
  }
}

module.exports = MiraEditorBase;