'use strict';

require('../styles/clip.less');
const MiraEditorBase = require('./base-view');

class MiraClipHandle extends MiraEditorBase {
  static TAG = 'mira-editor-clip-handle';

  init() {
    this.addClass('mirae-clip-handle');
    return super.init();
  }

}

MiraClipHandle.register();
module.exports = MiraClipHandle;