import { Rectangle } from 'pixi.js';
import PluginUtil from '../util/plugin';

const FrameNode = {
  initHook(obj) {
    PluginUtil
      .wrap(obj.prototype, 'createView')
      .after(function (args, view) {
        try {
          return this._fn_updateFrame(view);
        } catch (e) {
          return view;
        }
      });
    PluginUtil
      .wrap(obj.prototype, 'updateView')
      .after(function (args, view) {
        try {
          return this._fn_updateFrame(view);
        } catch (e) {
          return view;
        }
      });
  },

  _fn_updateFrame(view) {
    if (!view || !view.texture) return;
    let [x, y, mw, mh] = [0, 0, this.material.width, this.material.height];
    const frame = this.frame;
    if (frame) [x, y, mw, mh] = [frame.x, frame.y, frame.w, frame.h];
    if (!mw || !mh) return view; // 获取原始素材的宽高失败，或已经被设置为0

    const fit = this.getConf('object-fit') || 'cover';
    let scale;
    let [width, height] = [this.getConf('width'), this.getConf('height')];
    if (!width || !height) { // 宽高设置不全，根据源素材比例来适配
      if (width) scale = width / mw;
      else if (height) scale = height / mh;
      else scale = 1.0; // this.getConf('scale') || 
    } else { // 宽高都设置了，根据fit属性来cover/contain/none/fill
      if (fit === 'cover') scale = Math.max(width/mw, height/mh);
      else if (fit === 'contain') scale = Math.min(width/mw, height/mh);
      else if (fit === 'none') scale = 1.0;
      else if (fit === 'scale-down') scale = Math.min(1.0, Math.min(width/mw, height/mh));
      else if (fit === 'fill') {
        view.texture.frame = new Rectangle(x, y, mw, mh);
        return view.attr({ width, height }); // 直接宽高拉伸
      }

      let [dw, dh] = [width / scale, height / scale];
      const [ left, top ] = this.getObjectPosition();
      const w = Math.min(dw, mw);
      const h = Math.min(dh, mh);
      x += (mw - w) * left;
      y += (mh - h) * top;
      [mw, mh] = [w, h];
    }
    // console.log('fitsize', this.id, {mw, mh, width, height, scale}, view.texture.frame);
    view.texture.frame = new Rectangle(x, y, mw, mh);
    view.attr({ absScale: scale });
  },

  get frame() {
    if (!this.material) return;
    const pframe = this.getConf('pframe');
    if (pframe) {
      const [ mw, mh ] = [this.material.width, this.material.height];
      const [ x, y, w, h ] = [
        pframe.x * mw, pframe.y * mh,
        pframe.w * mw, pframe.h * mh ];
      return { x, y, w, h };
    } else {
      const frame = this.getConf('frame');
      return (frame?.w && frame?.h) ? {...frame} : null;
    }
  },

  getObjectPosition() {
    let position = this.getConf('object-position');
    // position默认跟anchor一样
    const [ax, ay] = this.getConf('anchor');
    if (!Array.isArray(position) || position.length != 2) position = [ax, ay];
    let [ left, top ] = position;
    left = isNaN(Number(left)) ? ax : Math.max(0, Math.min(1, Number(left)));
    top = isNaN(Number(top)) ? ay : Math.max(0, Math.min(1, Number(top)));
    return [left, top];
  }

};

export default FrameNode;