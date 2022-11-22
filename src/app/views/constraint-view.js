'use strict';

require('../styles/constraint.less');
const MiraEditorBase = require('./base-view');

class MiraEditorLine extends MiraEditorBase {
  static TAG = 'mira-editor-line';
  static STYLE_CLASS = 'mirae-line';

  init() {
    this.addClass(this.constructor.STYLE_CLASS);
    return super.init();
  }

  get opType() {
    return this.type === 'x' ? 'y' : 'x';
  }

  range(range) {
    range = this.forceRange || range;
    const val = Math.floor(range[0] * this.scale);
    const len = Math.ceil((range[1] - range[0]) * this.scale);
    return this.setStyleVars({ [`--${this.opType}`]: `${val}px`, '--len': `${len}px` });
  }

  setOpts({ type, val, range, scale, key, canvas }) {
    this.scale = scale;
    this.type = type;
    if (key === 'canvas') {
      this.addClass(`${this.constructor.STYLE_CLASS}-solid`);
      val = val.toFixed(1);
      if ((type === 'x' && canvas.center.x.toFixed(1) !== val) ||
          (type === 'y' && canvas.center.y.toFixed(1) !== val)) {
        return this.showCanvasBounds({ val, range, canvas });
      } else {
        this.forceRange = [0, canvas.center[this.opType] * 2];
      }
    } else if (key) this.addClass(`debug-${key}`);
    return this.setStyleVars({ [`--${type}`]: `${Math.floor(val*scale)}px` }).range(range);
  }

  showCanvasBounds({ val, range, canvas }) {
    this.addClass(`${this.constructor.STYLE_CLASS}-canvas`);
    const style = {
      '--x': `${Math.floor(canvas.x*this.scale)}px`,
      '--y': `${Math.floor(canvas.y*this.scale)}px`,
      '--width': `${Math.ceil(canvas.width*this.scale+1)}px`,
      '--height': `${Math.ceil(canvas.height*this.scale+1)}px`,
    };
    this.forceRange = [canvas[this.type], 0];
    return this.setStyleVars(style);
  }

  static create(opts) {
    const { container, type } = opts;
    const klass = `${this.STYLE_CLASS}-${type}`;
    return super.create(container).addClass(klass).setOpts(opts);
  }

}

MiraEditorLine.register();
module.exports = MiraEditorLine;