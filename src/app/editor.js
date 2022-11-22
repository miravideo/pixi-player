import EventEmitter from "eventemitter3";
import Select from './controls/select';
import Move from './controls/move';
import Resize from './controls/resize';
import Rotate from './controls/rotate';
import { color } from './utils/color';
const { CHANGING, CHANGED, HOVER, RESIZE, SELECT, OP_ADD, OP_DELETE, OP_END, MAX } = require('./utils/static');

const DEFAULT_OPTS = {
  majorColor: '#1FB0F9', selectedColor: '#1FB0F9', highlightColor: '#B2B5B6',
  cropColor: '#E33', refLineColor: '#F8DD0B',
  textSelectionColor: '#7FD4FF', textCursorColor: '#EFEFEF',
};

/**
 * 新增一个Control：
 * 1. 加入CONTROL_LIST
 * 2. select.js里的EVENTS，添加对应事件（用于操作历史undo/redo）
 * 3. select-view.js里添加type同名事件，用于将操作应用到选择框（box）
 */
const DEFAULT_CONTROLS = [Select, Move, Resize, Rotate]; //, Crop, Fit, Constraint

class Editor extends EventEmitter {
  constructor(player) {
    super();
    this.player = player;
    this.controls = [];
    this.init();
  }

  init() {
    this.events = {
      playing: this.onBlur(),
      timeupdate: this.onTimeUpdate(),
      click: this.onBlur(),
      hover: this.onHover(),
      movestart: this.onMoveStart(),
      moveend: this.onMoveEnd(),
    }
    for (const [evt, func] of Object.entries(this.events)) {
      this.player.on(evt, func);
    }

    const options = { ...DEFAULT_OPTS, ...this.player.options };

    const controls = options.editorControls;
    DEFAULT_CONTROLS.filter(klass => {
      if (!Array.isArray(controls)) return true;
      return controls.includes(klass) || controls.includes(klass.type);
    }).map(klass => {
      return this.controls[klass.type.toLowerCase()] = new klass(this);
    });

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

    this.opts = options;
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

  async update(nodes, attrs, senderId) {
    return await this.player.update(nodes, attrs, senderId);
  }

  onTimeUpdate() {
    return (evt) => this.emit(RESIZE); // unselect
  }

  onBlur() {
    return (evt) => this.emit(SELECT); // unselect
  }

  onHover() {
    return (evt) => this.emit(HOVER, evt);
  }

  onMoveStart() {
    return (evt) => this.emit(SELECT, evt);
  }

  onMoveEnd() {
    return (evt) => {}
  }

  destroy() {
    this.player = null;
  }
}

export default Editor;