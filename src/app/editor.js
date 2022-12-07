import EventEmitter from "eventemitter3";
import Select from './controls/select';
import Move from './controls/move';
import Resize from './controls/resize';
import Rotate from './controls/rotate';
import Crop from './controls/crop';
import Fit from './controls/fit';
import Constraint from './controls/constraint';
import { color } from './utils/color';
import Draft from './utils/draft';
import md5 from "md5";
const { HISTORY, HOVER, RESIZE, SELECT, KEYDOWN, KEYUP, MAX, SAVED, CHANGED } = require('./utils/static');

const DEFAULT_OPTS = {
  autoSave: false,
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
      loaded: this.onLoad(),
      change: this.onChange('change'),
      undo: this.onChange('undo'),
      redo: this.onChange('redo'),
    }
    for (const [evt, func] of Object.entries(this.events)) {
      this.player.on(evt, func);
    }

    const options = { ...DEFAULT_OPTS, ...this.player.options };
    this.opts = options;

    this.initContainer();

    const controls = options.editorControls;
    DEFAULT_CONTROLS.filter(klass => {
      if (!Array.isArray(controls)) return true;
      return controls.includes(klass) || controls.includes(klass.type);
    }).map(klass => {
      return this.controls[klass.type.toLowerCase()] = new klass(this);
    });

    if (options.autoSave) {
      this.autoSave();
    }
  }

  initContainer() {
    const { container, opts } = this;
    const colors = {
      '--miraeBorderColor': color(opts.majorColor, 100),
      '--miraeCropBorderColor': color(opts.cropColor, 100),
      '--miraeSelBorderColor': color(opts.selectedColor, 100),
      '--miraeRefLineColor': color(opts.refLineColor, 100),
      '--miraeHighlightColor': color(opts.highlightColor, 100),
    };
    for (const [k, v] of Object.entries(colors)) {
      container.style.setProperty(k, v);
    }
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

  onChange(type) {
    return (evt) => this.emit(CHANGED, {...evt, type});
  }

  onLoad() {
    return (evt) => this.initContainer();
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
    return (evt) => {
      this.player.focus();
      if (this.core.playing) return;
      this.emit(HOVER, evt);
    }
  }

  onMoveStart() {
    return (evt) => {
      if (this.core.playing) {
        this.core.pause();
        if (evt.target) this.emit(HOVER, { target: evt.target, type: 'mouseover' });
        return;
      }
      this.emit(SELECT, evt);
    }
  }

  onMoveEnd() {
    return (evt) => {
      if (this.core.playing) return;
      // debounce click
      this.controls.select.lock(30, null, 'click');
    }
  }

  onKeyDown() {
    return (evt) => {
      this.emit(KEYDOWN, evt);
      if (evt.key === 'Escape') {
        this.emit(SELECT); // unselect all
      } else if (evt.key.toLowerCase() === 'z' && evt.mctrlKey) {
        evt.shiftKey ? this.redo() : this.undo();
      } else if (evt.key.toLowerCase() === 'y' && evt.mctrlKey) {
        this.redo();
      }
    }
  }

  onKeyUp() {
    return (evt) => {
      this.emit(KEYUP, evt);
      if (evt.code === 'Space' && !this.controls.move.editMode) {
        this.player.togglePlay();
      }
    }
  }

  onResize() {
    return (evt) => this.emit(RESIZE, evt);
  }

  get selected() {
    return this.controls.select.selected;
  }

  get changed() {
    return this.player.history.length > 0;
  }

  // history
  async undo(n=1) {
    const rs = await this.player.undo(n);
    if (rs.changed) this.emit(HISTORY, {...rs, op: 'undo'});
    else this.emit(SELECT); // unselect
  }

  async redo(n=1) {
    const rs = await this.player.redo(n);
    if (rs.changed) this.emit(HISTORY, {...rs, op: 'redo'});
    else this.emit(SELECT); // unselect
  }

  get canUndo() {
    return this.player.canUndo;
  }

  get canRedo() {
    return this.player.canRedo;
  }

  get core() {
    return this.player.core;
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
    const res = await this.player.update(nodes, attrs, senderId, sync);
    if (this.opts.autoSave) this.autoSave();
    return res;
  }

  async cloneNode(src) {
    const node = new src.constructor({...src.conf, refId: null, id: null});
    if (src.type === 'mixin' && src.mixinType) {
      // init mixin!!!
      await this.core.initMixin(src.mixinType, node);
    }
    node.parent = src.parent; // tmp parent, just set for annotate
    node.copySourceId = src.id;
    node.trackId = src.trackId;
    // groupId不能跟src一样，但之前src同样的groupId的node，应该新的groupId还是一样的
    if (src.groupId) node.conf.groupId = md5(`${src.groupId}_copy`);
    await node.preload();
    node.annotate();
    if (!node.zIndex) node.zIndex = src.zIndex;
    node.parent = null; // remove tmp parent..
    return node;
  }

  autoSave(delay=3) {
    const t = Number(this.opts.autoSave) > 1 ? Number(this.opts.autoSave) : 30;
    this.controls.select
      .lock(t * 1000, () => {
        this.autoSave();
      }, 'autoSave')
      .lock(delay * 1000, () => {
        if (this.changed) this.save();
      }, 'delaySave');
  }

  async save(name) {
    const item = this.draft || {};
    if (name) item.name = name;
    this.draft = await Draft.save(this.rootNode, item);
    this.emit(SAVED, this.draft);
    return this.draft;
  }

  async allDrafts(sort, asc) {
    return await Draft.list(sort, asc);
  }

  async delDraft(key) {
    return await Draft.delete(key);
  }

  async loadDraft(key) {
    const item = await Draft.load(key);
    const opts = {...this.player.options};
    opts.value = item.data;
    for (const k of ['width', 'height']) {
      delete opts[k];
    }
    this.player.load(opts);
    return this.draft = item;
  }

  destroy() {
    this.player = null;
    this.removeAllListeners();
  }
}

export default Editor;