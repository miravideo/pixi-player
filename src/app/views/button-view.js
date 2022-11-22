'use strict';

const MiraEditorBase = require('./base-view');

class MiraButton extends MiraEditorBase {
  static TAG = 'mira-editor-button';

  init() {
    this.addClass(MiraButton.TAG);
    return super.init();
  }

  setTint(title) {
    this.set('data-tint', title);
  }

  static create(parent) {
    return super.create(parent).addMoveListener(parent);
  }
}

MiraButton.register();
module.exports = MiraButton;