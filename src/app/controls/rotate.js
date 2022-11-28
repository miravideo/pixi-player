'use strict';

const MiraEditorRotate = require('../views/rotate-view');
const Move = require('./move');
const { dot, cross, norm2d, sum, deg } = require('../utils/math');

const MIN_MOVE_SIZE = 30;

class Rotate extends Move {
  static type = "rotate";
  static TAG = MiraEditorRotate;

  show(show) {
    if (show === undefined) show = !this.selector.withMulti;
    if (this.editor.controls.move?.editMode) show = false;
    if (this._controls.rotate) this._controls.rotate.show(show);
    return this;
  }

  controls(box) {
    if (this.node.conf.rotateDisable || this.node.cropMode) return {};
    return { rotate: { box: box.handleBox, styleClass: 'handle' } };
  }

  // do nothing..
  updateShow(box) { }

  getDelta(event) {
    if (!this.boxAnchor) {
      const { left, top } = this.editor.container.getBoundingClientRect();
      let { x, y } = this.box.position;
      x = x * this.box.scale + left;
      y = y * this.box.scale + top;
      this.boxAnchor = { x, y };
    }

    const { x, y } = this.boxAnchor;
    const to   = { x: event.position.x - x, y: event.position.y - y };
    const from = { x: to.x - event.delta.x, y: to.y - event.delta.y };
    let delta = Math.acos(dot(from, to) / (norm2d(from) * norm2d(to)));
    if (isNaN(delta)) return { rotation: 0 };
    delta *= cross(from, to) > 0 ? 1 : -1;
    return { rotation: delta };
  }

  async onMove(event) {
    if (!this.node || !this.box) return;
    await this.update(this.getDelta(event));
    this.box.rotate();
    this.toast(`${deg(this.box.rotation, 0)}°`, 1000);
  }

  onMoveEnd(event) {
    if (!super.onMoveEnd(event)) return;
    this.boxAnchor = null;
    this.toast('', 0);
  }
}

module.exports = Rotate;