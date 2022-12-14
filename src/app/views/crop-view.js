'use strict';

require('../styles/crop.less');
const { dmap } = require('../utils/data');
const MiraEditorMove = require('./move-view');

class MiraEditorCrop extends MiraEditorMove {
  static TAG = 'mira-editor-crop';
  static STYLE_CLASS = 'mirae-crop';

  setOpts(opts) {
    super.setOpts(opts);
    this.node = this.parentNode.node;
    if (opts.canvas) {
      this.image = document.createElement("img");
      this.image.setAttribute('mira-editor-el', '');
      this.canvas = opts.canvas;
      this.updateImage();
      this.appendChild(this.image);
    }
    // init fit size
    this.origin = opts.styleClass === 'origin';
    this.fit();
    return this;
  }

  updateImage() {
    const flipX = this.node.getConf('flipX', false);
    const flipY = this.node.getConf('flipY', false);
    this.image.style.transform = `scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`;
    this.image.src = this.canvas.toDataURL();
  }

  showGrid() {
    if (this.grid) return;
    this.grid = true;
    const addGrid = (klass, parent) => {
      const dom = document.createElement("div");
      dom.setAttribute('mira-editor-el', '');
      dom.classList.add(klass);
      parent.appendChild(dom);
      return dom;
    }
    for (let i = 0; i < 3; i++) {
      const row = addGrid('mirae-grid-row', this);
      for (let j = 0; j < 3; j++) {
        addGrid('mirae-grid', row);
      }
    }
  }

  fit() {
    this.origin ? this.fitOrigin() : this.fitFrame();
  }

  metrics() {
    const box = this.parentNode;
    const node = this.node;
    const view = node.getView();
    const [ mw, mh ] = [node.material.width, node.material.height];
    const [ bw, bh ] = [view.width, view.height];
    const frame = node.frame || { x: 0, y: 0, w: mw, h: mh };;
    // scale 是【画布尺寸】跟【素材原始尺寸】的关系
    const scale = Math.max((bw / frame.w), (bh / frame.h));
    this.rotation = box.rotation;
    this.scale = box.scale;
    this.anchor = {x: 0, y: 0};
    return [frame, mw, mh, scale];
  }

  setFrame(frame) {
    const box = this.parentNode;
    this.position = { x: frame.x, y: frame.y };
    this.size = { width: frame.w, height: frame.h };
    this.setStyleVars({ 
      '--x': `${frame.x * box.scale}px`, '--y': `${frame.y * box.scale}px`,
      '--width': `${frame.w * box.scale}px`, '--height': `${frame.h * box.scale}px`,
    });
  }

  fitFrame() {
    const [ frame, mw, mh, scale ] = this.metrics();
    const [ w, h ] = [scale * frame.w + 4, scale * frame.h + 4];
    const flipX = this.node.getConf('flipX', false);
    const flipY = this.node.getConf('flipY', false);
    const x = - (flipX ? -1 : 1) * ((mw - frame.w) * 0.5 - frame.x) * scale;
    const y = - (flipY ? -1 : 1) * ((mh - frame.h) * 0.5 - frame.y) * scale;
    this.setFrame({ x, y, w, h });
  }

  fitOrigin() {
    const [ frame, mw, mh, scale ] = this.metrics();
    const [ w, h ] = [scale * mw, scale * mh];
    const flipX = this.node.getConf('flipX', false);
    const flipY = this.node.getConf('flipY', false);
    const x = (flipX ? -1 : 1) * ((mw - frame.w) * 0.5 - frame.x) * scale;
    const y = (flipY ? -1 : 1) * ((mh - frame.h) * 0.5 - frame.y) * scale;
    this.setFrame({ x, y, w, h });
  }

  resize(delta) {
    const w = delta.size.width + this.size.width;
    const h = delta.size.height + this.size.height;
    const x = delta.position.x + this.position.x + (delta.size.width * 0.5);
    const y = delta.position.y + this.position.y + (delta.size.height * 0.5);
    this.setFrame({ x, y, w, h });
  }

  remove() {
    this.canvas = null;
    this.image = null;
    super.remove();
  }
}

MiraEditorCrop.register();
module.exports = MiraEditorCrop;