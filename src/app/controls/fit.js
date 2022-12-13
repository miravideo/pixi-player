'use strict';

const MiraEditorFit = require('../views/fit-view');
const Move = require('./move');
const { round } = require('../utils/math');
const { OP_END, CHANGING, CROPFRAME, SELECT } = require('../utils/static');

// todo: refactor change name
class Fit extends Move {
  static type = "fit";
  static TAG = MiraEditorFit;
  static CHG_HOOK = 'setRotate'; // 因为旋转后需要隐藏

  show(show) {
    if (show === undefined) show = !this.selector.withMulti;
    if (this.editor.controls.move?.editMode) show = false;
    if (this._controls.fit) this._controls.fit.show(show && this.node.getConf('rotation', false) === 0);
    if (this._controls.crop) this._controls.crop.show(show && this.editor.canCropFrame(this.node));
    if (this._controls.flipX) this._controls.flipX.show(show);
    if (this._controls.flipY) this._controls.flipY.show(show);
    if (this._controls.edit) this._controls.edit.show(show);
    if (this._controls.group) this._controls.group.show(show).toggleClass('locked', !!this.node.groupLocked);
    if (this._controls.regroup) this._controls.regroup.show(show && this.node.conf.srcGroupId);
    return this;
  }

  controls(box) {
    const ctls = {};
    if (this.node.cropMode) return ctls;
    if (this.node.type === 'group') {
      return { group: { box: box.handleBox, styleClass: 'group' } };
    } else if (this.node.conf.srcGroupId) {
      ctls.regroup = { box: box.handleBox, styleClass: 'regroup' };
    }
    if (this.node.getConf('fitable', false)) {
      ctls.fit = { box: box.handleBox, styleClass: 'fit' };
    }
    if (this.node.getConf('cropable', false)) {
      ctls.crop = { box: box.handleBox, styleClass: 'crop' };
    }
    // if (this.node.getConf('previewable', false)) {
    //   ctls.edit = { box: box.handleBox, styleClass: 'edit' };
    // }
    if (this.node.getConf('flipable', false)) {
      ctls.flipX = { box: box.handleBox, styleClass: 'flipX' };
      ctls.flipY = { box: box.handleBox, styleClass: 'flipY' };
    }
    return ctls;
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
      this.editor.enablePreviewMode(this.node);
      // this.editor.setCropMode(this.node, true);
    } else if (event.target.hasClass('edit')) {
      this.editor.setPreviewMode(this.node);
    } else if (event.target.hasClass('flipX')) {
      await this.editor.update([this.node], { flipX: !this.node.conf.flipX }, this.box.uuid);
    } else if (event.target.hasClass('flipY')) {
      await this.editor.update([this.node], { flipY: !this.node.conf.flipY }, this.box.uuid);
    } else if (event.target.hasClass('group')) {
      const lock = !this.node.groupLocked;
      await this.node.lock(lock);
      if (lock) {
        this.show(true);
        this.box.refresh();
      } else {
        this.box.removeClass('group-locked');
        // unselect all after unlock
        this.lock(300, () => this.editor.emit(SELECT), 'group-lock');
      }
    } else if (event.target.hasClass('regroup')) {
      const {srcGroupId} = this.node.conf;
      if (!srcGroupId) return;
      const nodes = this.editor.nodes.filter(n => {
        // this.node已经选中了，需要排除掉，否则会被反选掉
        return n.conf.srcGroupId === srcGroupId && n !== this.node;
      });
      this.editor.emit(SELECT, { action: 'multi', nodes, target: this.node });
    }
  }
}

module.exports = Fit;