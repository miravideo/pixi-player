import EventEmitter from "eventemitter3";
import Select from './controls/select';
import Move from './controls/move';
import Resize from './controls/resize';
import Rotate from './controls/rotate';
import Crop from './controls/crop';
import Fit from './controls/fit';
import Constraint from './controls/constraint';
import { color } from './utils/color';
const { CHANGING, CHANGED, HOVER, RESIZE, SELECT, KEYDOWN, KEYUP, MAX } = require('./utils/static');

const DEFAULT_OPTS = {
  majorColor: '#1FB0F9', selectedColor: '#1FB0F9', highlightColor: '#B2B5B6',
  cropColor: '#E33', refLineColor: '#F8DD0B',
  textSelectionColor: '#7FD4FF', textCursorColor: '#EFEFEF',
  refLineRange: 10, canvasMarginRef: 0,
  enableCanvasConstraint: true,
  debugCanvasConstraint: false,
};

/**
 * 新增一个Control：
 * 1. 加入CONTROL_LIST
 * 2. select.js里的EVENTS，添加对应事件（用于操作历史undo/redo）
 * 3. select-view.js里添加type同名事件，用于将操作应用到选择框（box）
 */
const DEFAULT_CONTROLS = [Select, Move, Resize, Rotate, Crop, Fit, Constraint];

class Editor extends EventEmitter {
  constructor(player) {
    super();
    this.player = player;
    this.controls = [];
    this.init();
  }

  init() {
    this.events = {
      burning: this.onBlur(),
      playing: this.onBlur(),
      timeupdate: this.onTimeUpdate(),
      resize: this.onResize(),
      click: this.onBlur(),
      hover: this.onHover(),
      movestart: this.onMoveStart(),
      moveend: this.onMoveEnd(),
      keydown: this.onKeyDown(),
      keyup: this.onKeyUp(),
    }
    for (const [evt, func] of Object.entries(this.events)) {
      this.player.on(evt, func);
    }

    const options = { ...DEFAULT_OPTS, ...this.player.options };
    this.opts = options;

    const { container } = this;
    const colors = {
      '--miraeBorderColor': color(options.majorColor, 100),
      '--miraeCropBorderColor': color(options.cropColor, 100),
      '--miraeSelBorderColor': color(options.selectedColor, 100),
      '--miraeRefLineColor': color(options.refLineColor, 100),
      '--miraeHighlightColor': color(options.highlightColor, 100),
    };
    for (const [k, v] of Object.entries(colors)) {
      container.style.setProperty(k, v);
    }

    const controls = options.editorControls;
    DEFAULT_CONTROLS.filter(klass => {
      if (!Array.isArray(controls)) return true;
      return controls.includes(klass) || controls.includes(klass.type);
    }).map(klass => {
      return this.controls[klass.type.toLowerCase()] = new klass(this);
    });
  }

  get container() {
    return this.player.editorContainer;
  }

  get scale() {
    return this.player.scale;
  }

  get canvas() {
    return this.player.canvas;
  }

  enableKeyboard(enable) {
    this.opts.enableKeyboard = enable;
    this.player.enableKeyboard(enable);
  }

  toast(msg, durationInMs) {
    this.player.toast(msg, durationInMs);
  }

  showLoading(progress) {
    this.player.showLoading(progress);
  }

  hideLoading() {
    this.player.hideLoading();
  }

  onTimeUpdate() {
    return (evt) => this.emit(RESIZE); // update
  }

  onBlur() {
    return (evt) => {
      // debounce click
      if (this.controls.select.locked('click')) return;
      this.emit(SELECT); // unselect
    }
  }

  onHover() {
    return (evt) => this.emit(HOVER, evt);
  }

  onMoveStart() {
    return (evt) => this.emit(SELECT, evt);
  }

  onMoveEnd() {
    return (evt) => {
      // debounce click
      this.controls.select.lock(30, null, 'click');
    }
  }

  onKeyDown() {
    return (evt) => this.emit(KEYDOWN, evt);
  }

  onKeyUp() {
    return (evt) => this.emit(KEYUP, evt);
  }

  onResize() {
    return (evt) => this.emit(RESIZE, evt);
  }

  get selected() {
    return this.controls.select.selected;
  }

  // history
  undo(n=1, hide=true) {
    const rs = this.player.undo(n);
    // todo: 如果不是新增和删除，可以不用清空选择
    if (hide) this.emit(SELECT);
  }

  redo(n=1, hide=true) {
    const rs = this.player.redo(n);
    if (hide) this.emit(SELECT);
  }

  get rootNode() {
    return this.player.core.rootNode;
  }

  get nodes() {
    return this.rootNode.allNodes;
  }

  canCropFrame(node) {
    node = node || this.selected[0];
    if (!node || (node.getConf('object-fit') !== 'cover')) return false;
    return true;
  }

  setCropMode(node, enable) {
    const selectControl = this.controls.select;
    node = node || this.selected[0];
    if (!this.canCropFrame(node)) return;
    selectControl.hideSelect();
    node.cropMode = enable ? 'frame' : false;
    // this.cropMode = node.cropMode;
    setTimeout(() => {
      selectControl.showSelect(node);
    }, 1);
  }

  getViewAttr(node, delta) {
    const view = node.getView();
    const attrs = {};
    for (const [k, v] of Object.entries(delta)) {
      // if (!v) continue; // 如果delta=0，就是没改变
      if (k === 'scale') {
        attrs[k] = view.relativeScale.x * (1 + v);
      } else {
        attrs[k] = view[k] + v;
      }
    }
    return attrs;
  }

  async update(nodes, attrs, senderId, sync) {
    return await this.player.update(nodes, attrs, senderId, sync);
  }

  async cloneNode(src) {
    const node = new src.constructor({...src.conf, refId: null, id: null});
    node.parent = src.parent; // tmp parent, just set for annotate
    if (src.cachedFontFamily) node.cachedFontFamily = src.cachedFontFamily; // todo: font
    node.copySourceId = src.id;
    node.trackId = src.trackId;
    await node.preload();
    node.annotate();
    node.parent = null; // remove tmp parent..
    return node;
  }

  destroy() {
    this.player = null;
  }
}

export default Editor;