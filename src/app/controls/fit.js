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
    if (show === undefined) show = true;
    if (this._controls.fit) this._controls.fit.show(show && this.node.rotate === 0);
    if (this._controls.crop) this._controls.crop.show(show);
    if (this._controls.flipX) this._controls.flipX.show(show);
    if (this._controls.flipY) this._controls.flipY.show(show);
    return this;
  }

  controls(box) {
    if (this.node.cropMode) return {};
    if (!['video', 'image'].includes(this.node.type) || this.node.conf.asMask) {
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

  onMoveEnd(event) {
    if (event.moved > 5 || !this.node) return;
    // console.log('click!!', event.target);
    if (event.target.hasClass('fit')) {
      let to = {};
      if (this.node.conf.width === '100vw' && this.node.conf.height === '100vh') {
        // cover -> contain
        const r = this.node.material.width() / this.node.material.height();
        const cr = this.node.creator().width / this.node.creator().height;
        if (cr > r) to = { height: '100vh', width: 'NULL' };
        else to = { width: '100vw', height: 'NULL' };
      } else {
        // contain/other -> cover
        to = { width: '100vw', height: '100vh' };
      }
      const delta = { to: { ...to, x: '50vw', y: '50vh', 'object-fit': 'cover' } };
      // console.log(delta.to, [this.node.conf.width, this.node.conf.height]);
      Fit.apply(this.node, delta, 'resize');
      this.node.emit(CHANGING, {action: OP_END});
      this.box.resize();
    } else if (event.target.hasClass('crop')) {
      this.node.emit(CROPFRAME);
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