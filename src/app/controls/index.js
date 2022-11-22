
const Select = require('./select');
const Resize = require('./resize');
const Crop = require('./crop');
const Move = require('./move');
const Rotate = require('./rotate');
const Fit = require('./fit');
const Constraint = require('./constraint');

const MiraEditorBox = require('../views/select-view');
const MiraEditorMove = require('../views/move-view');
const MiraEditorResize = require('../views/resize-view');
const MiraEditorRotate = require('../views/rotate-view');
const MiraEditorCrop = require('../views/crop-view');
const MiraEditorFit = require('../views/fit-view');
const MiraEditorLine = require('../views/constraint-view');

/**
 * 新增一个Control：
 * 1. 加入CONTROL_LIST
 * 2. select.js里的EVENTS，添加对应事件（用于操作历史undo/redo）
 * 3. select-view.js里添加type同名事件，用于将操作应用到选择框（box）
 */
const CONTROL_LIST = [Select, Move, Resize, Rotate, Crop, Fit, Constraint];

module.exports = {
  Select, Resize, Move, Rotate, Crop, Fit, Constraint,
  MiraEditorBox, MiraEditorMove, MiraEditorResize, MiraEditorRotate, MiraEditorCrop, MiraEditorFit, MiraEditorLine,
  addControls: function (editor, controls) {
    return CONTROL_LIST.filter(klass => {
      if (!Array.isArray(controls)) return true;
      return controls.includes(klass) || controls.includes(klass.type);
    }).map(klass => {
      return editor.controls[klass.type.toLowerCase()] = new klass(editor);
    });
  }
}