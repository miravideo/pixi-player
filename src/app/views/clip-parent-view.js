'use strict';

require('../styles/clip.less');
const MiraEditorBase = require('./base-view');

class MiraClipPLine extends MiraEditorBase {
  static TAG = 'mira-editor-clip-pline';

  init() {
    this.addClass('mirae-clip-pline');
    return super.init();
  }

  update(top, width, height) {
    this.setStyle({
      top: `${top-Math.max(height, 0)}px`,
      left: `${-2-Math.max(width, 0)}px`,
      height: `${Math.abs(height)}px`,
      width: `${Math.abs(width) + 2}px`,
      borderLeftWidth: `${width > 0 ? 0 : 2}px`,
      borderRightWidth: `${width > 0 ? 2 : 0}px`,
      borderTopWidth: `${height > 0 ? 2 : 0}px`,
      borderBottomWidth: `${height > 0 ? 0 : 2}px`,
    });
  }
}

MiraClipPLine.register();
module.exports = MiraClipPLine;