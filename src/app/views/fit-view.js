'use strict';

require('../styles/fit.less');
const MiraEditorMove = require('./move-view');
const { deg } = require('../utils/math');

class MiraEditorFit extends MiraEditorMove {
  static TAG = 'mira-editor-fit';
  static STYLE_CLASS = 'mirae-fit';
}

MiraEditorFit.register();
module.exports = MiraEditorFit;