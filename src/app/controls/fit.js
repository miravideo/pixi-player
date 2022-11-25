'use strict';

const MiraEditorFit = require('../views/fit-view');
const Move = require('./move');
const { round } = require('../utils/math');
const { OP_END, CHANGING, CROPFRAME } = require('../utils/static');

class Fit extends Move {
  static type = "fit";
  static TAG = MiraEditorFit;
  static CHG_HOOK = 'setRotate'; // 因为旋转后需要隐藏

  show(show) {
    if (show === undefined) show = !this.selector.withMulti;
    if (this._controls.fit) this._controls.fit.show(show && this.node.getConf('rotation', false) === 0);
    if (this._controls.crop) this._controls.crop.show(show && this.editor.canCropFrame(this.node));
    if (this._controls.flipX) this._controls.flipX.show(show);
    if (this._controls.flipY) this._controls.flipY.show(show);
    return this;
  }

  controls(box) {
    if (this.node.cropMode) return {};
    if (!['video', 'image'].includes(this.node.type) || this.node.asMask) {
      return {
        flipX: { box: box.handleBox, styleClass: 'flipX' },
        flipY: { box: box.handleBox, styleClass: 'flipY' }
      };
    }
    return { 
      fit: { box: box.handleBox, styleClass: 'fit' },
      crop: { box: box.handleBox, styleClass: 'crop' },
      flipX: { box: box.handleBox, styleClass: 'flipX' },
      // flipY: { box: box.handleBox, styleClass: 'flipY' },
    };
  }

  updateShow(box) {
    // 旋转之后，应该就隐藏了
    return this.show();
  }

  onMoveStart(event) { }

  onMove(event) { }

  async onMoveEnd(event) {
    if (event.moved > 5 || !this.node) return;
    // console.log('click!!', event.target);
    if (event.target.hasClass('fit')) {
      let to = {};
      const r = this.node.material.width / this.node.material.height;
      const cr = this.node.player.width / this.node.player.height;
      // cover -> contain
      if (cr > r) to = { height: '100vh', width: null };
      else to = { width: '100vw', height: null };
      if (this.node.conf.width == to.width || this.node.conf.height == to.height) {
        // contain/other -> cover
        if (cr > r) to = { width: '100vw', height: null };
        else to = { height: '100vh', width: null };
      }
      const attrs = { ...to, x: '50vw', y: '50vh', scale: 1.0, 'object-fit': 'cover' };
      // console.log(delta.to, [this.node.conf.width, this.node.conf.height]);
      await this.editor.update([this.node], attrs, this.box.uuid);
      this.box.resize();
    } else if (event.target.hasClass('crop')) {
      this.editor.setCropMode(this.node, true);
    } else if (event.target.hasClass('flipX')) {
      Fit.apply(this.node, { to: { flipX: !this.node.conf.flipX } }, 'resize');
      this.node.emit(CHANGING, {action: OP_END});
    } else if (event.target.hasClass('flipY')) {
      Fit.apply(this.node, { to: { flipY: !this.node.conf.flipY } }, 'resize');
      this.node.emit(CHANGING, {action: OP_END});
    }
  }
}

module.exports = Fit;