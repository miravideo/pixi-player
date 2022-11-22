'use strict';

require('../styles/rotate.less');
const MiraEditorMove = require('./move-view');
const { deg } = require('../utils/math');
const { wrap } = require('../utils/plugin');

class MiraEditorRotate extends MiraEditorMove {
  static TAG = 'mira-editor-rotate';
  static STYLE_CLASS = 'mirae-rotate';
  static CURSOR_CLASS = 'mirae-rot-cursor';
  static RA_NUM = 24;

  box() {
    return this.parentElement?.parentElement;
  }

  setOpts(opts) {
    super.setOpts(opts);
    const box = this.box();
    if (!box) return;
    this.wrapper = wrap(box, 'setRotate').after((_, r) => this.setRotate(box.rotation) && r);
    return this.addClass(this.constructor.CURSOR_CLASS).setRotate(box.rotation);
  }

  raOffset() {
    return parseInt(this.constructor.RA_NUM * 1.5);
  }

  setRotate(rotation) {
    const handleBox = this.box()?.handleBox;
    const r = (this.raOffset() + ((parseInt(deg(rotation)) + 7.5) / 15) >> 0) % this.constructor.RA_NUM;
    document.body.setAttribute('r', r.toString());
    this.set('r', r.toString());
    if (!handleBox?.classList) return this;
    if (handleBox.classList.contains('left')) {
      rotation += Math.PI / 2;
    } else if (handleBox.classList.contains('right')) {
      rotation -= Math.PI / 2;
    } else if (handleBox.classList.contains('top')) {
      rotation += Math.PI;
    }
    const rr = (this.raOffset() + ((parseInt(deg(rotation)) + 7.5) / 15) >> 0) % this.constructor.RA_NUM;
    document.body.setAttribute('rr', rr.toString());
    return this.set('rr', rr.toString());
  }

  remove() {
    if (this.wrapper) {
      this.wrapper.revoke();
      this.wrapper = null;
    }
    super.remove();
  }

  bindBodyEvents(on, types) {
    super.bindBodyEvents(on, types);
    if (on) {
      document.body.setAttribute('r', this.getAttribute('r') || '0');
      document.body.setAttribute('rr', this.getAttribute('rr') || '0');
      document.body.classList.add(this.constructor.CURSOR_CLASS);
    } else {
      document.body.classList.remove(this.constructor.CURSOR_CLASS);
    }
  }
}

MiraEditorRotate.register();
module.exports = MiraEditorRotate;