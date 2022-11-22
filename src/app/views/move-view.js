'use strict';

require('../styles/move.less');
const MiraEditorBase = require('./base-view');

class MiraEditorMove extends MiraEditorBase {
  static TAG = 'mira-editor-move';
  static STYLE_CLASS = 'mirae-move';

  init() {
    this.addClass(this.constructor.STYLE_CLASS);
    return super.init();
  }

  setOpts({ styleClass }) {
    this.styleClass = styleClass;
    return this.addClass(styleClass);
  }

  start(evt) {
    if (this.cbs.start) this.cbs.start(evt);
  }

  static create(opts) {
    const { box, moveListener } = opts;
    return super.create(box).setOpts(opts).addMoveListener(moveListener);
  }
}

MiraEditorMove.register();
module.exports = MiraEditorMove;