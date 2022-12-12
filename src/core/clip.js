import EventEmitter from 'eventemitter3';
import PluginUtil from '../util/plugin';
import Utils from '../util/utils';
import { DisplayObject, Filter, Sprite, Texture, filters } from "pixi.js";
import TransitionFilter from '../util/transition';
import SimpleFilter from '../util/filter';
import AudioUtil from '../util/audio';
import KeyFrames from '../util/keyframe';
import AnimationNode from '../mixin/animation';

import { Rectangle, SCALE_MODES } from 'pixi.js'

const DEFAULT_CONF = { active: true,
  x: '50vw', y: '50vh', anchor: [0.5, 0.5],
  scale: 1, rotation: 0, alpha: 1, speed: 1, volume: 1,
  enableAudioAnalyser: false, 'object-fit': 'cover',
};

const VIEW_TYPES = {
  'play': 'player',
  'seek': 'player',
  'preview': 'preview',
}

const VIEW_EVENTS = {
  hover: ['mouseover', 'mouseout'],
  movestart: ['mousedown', 'touchstart'],
  // move: ['mousemove', 'touchmove'], // 会有性能问题
  moveend: ['mouseup', 'mouseupoutside', 'touchend', 'touchendoutside']
};

DisplayObject.mixin({
  setBlur(blur) {
    if (isFinite(blur) && blur > 0) {
      if (this._blur) this._blur.blur = blur;
      else this._blur = new filters.BlurFilter(blur);
      this.addFilter(this._blur);
    } else {
      if (this._blur) this._blur.enabled = false;
    }
  },
  update() {
    this.texture.baseTexture.update();
  },
  get source() {
    return this.texture.baseTexture.resource.source;
  },
  set source(src) {
    if (this.texture.baseTexture.resource.source !== src) {
      // 避免可能的重复更新
      this.texture.baseTexture.resource.source = src;
    }
    this.texture.baseTexture.update();
  },
  addFilter: function (filter) {
    if (!this.filters) this.filters = [];
    if (!this.filters.includes(filter)) this.filters.push(filter);
    filter.enabled = true;
    filter.parent = this;
  },
  addView: function (view) {
    if (view instanceof Filter) {
      this.addFilter(view);
    } else if (!this.children.includes(view)) {
      if (view.filters && view.filters[0] instanceof TransitionFilter) {
        // [BUG] Container with SimpleFilter will flipY of the transition filter
        view.filters[0].setFlip(!(this.filters && this.filters[0] instanceof SimpleFilter));
      }
      // console.log('addView', view.id, `${view.refId} -> ${this.refId}`);
      this.addChild(view);
    }
  },
  removeView: function (view) {
    if (view instanceof Filter) {
      view.enabled = false;
    } else if (this.children.includes(view)) {
      this.removeChild(view);
      // console.log('removeView', `${view.refId} -> ${this.refId}`);
    }
  },
  attr: function (attrs) {
    if (!this.id) this.id = Utils.genUuid();
    if (!this.relativeScale) this.relativeScale = { x: 1.0, y: 1.0 };
    let scaleChanged = false;
    for (let key in attrs) {
      const val = attrs[key];
      switch (key) {
        case "absScale":
          if (this.scale) {
            this.scale.x = Array.isArray(val) ? val[0] : (Number(val) || 1.0);
            this.scale.y = Array.isArray(val) ? val[1] : (Number(val) || 1.0);
            scaleChanged = true;
          }
          break;
        case "scale":
          this.relativeScale.x = Array.isArray(val) ? val[0] : (Number(val) || 1.0);
          this.relativeScale.y = Array.isArray(val) ? val[1] : (Number(val) || 1.0);
          scaleChanged = true;
          break;
        case "skew":
          if (this.skew) {
            this.skew.x = Array.isArray(val) ? val[0] : (Number(val) || 0.0);
            this.skew.y = Array.isArray(val) ? val[1] : (Number(val) || 0.0);
          }
          break;
        case "anchor":
          if (this.anchor) {
            this.anchor.x = Array.isArray(val) ? val[0] : (Number(val) || 0.5);
            this.anchor.y = Array.isArray(val) ? val[1] : (Number(val) || 0.5);
          }
          break;
        default:
          this[key] = val;
      }
    }
    if (this.scale) {
      // 如果更改了这些值，需要重置initScale
      if (attrs['absScale'] || attrs['width'] || attrs['height']) {
        this.initScale = { x: this.scale.x, y: this.scale.y };
        scaleChanged = true;
      }
      if (scaleChanged) {
        if (!this.initScale) this.initScale = { x: 1, y: 1 };
        this.scale.x = this.initScale.x * this.relativeScale.x;
        this.scale.y = this.initScale.y * this.relativeScale.y;
      }
    }
  }
});

class Clip extends EventEmitter {
  constructor(conf = {}) {
    super();
    this.conf = { type: 'clip', ...conf };
    this.type = this.conf.type;
    this.parent = null;
    this.children = [];
    this._drawing = {};
    this._events = {};
    this.init();
  }

  get active() {
    return !!this.getConf('active', false);
  }

  get player() {
    return this.root()?.player;
  }

  get parents() {
    if (!this.parent || !this.parent.parents) return [];
    return [...this.parent.parents, this.parent];
  }

  static extends(mixin) {
    PluginUtil.extends({plugin: mixin, to: this});
  }

  init() {
    this.id = this.id || this.conf.id || Utils.genId(this.type);
    if (!this.conf.refId) this.conf.refId = Utils.genUuid();
    this._views = {};
    this.onDraw = () => false;
  }

  cacheType(type) {
    return VIEW_TYPES[type] || VIEW_TYPES['preview'];
  }

  setMask(absTime, type, mask) {
    const view = this.getView(absTime, type);
    if (view.mask === mask) return;
    if (!mask && view.mask) {
      view.mask.parent.removeChild(view.mask);
      view.mask = null;
    } else if (mask) {
      view.mask = mask;
      // 必须添加到节点树上才能正确渲染，且不能加给view的child(会受到scale的加倍影响)
      const vp = this.getViewParent(absTime, type);
      vp.addChild(mask);
    }
  }

  getView(absTime, type) {
    if (!absTime) absTime = this.player?.currentTime || 0;
    if (!type) type = 'seek';
    const cacheType = this.cacheType(type);
    if (!this._views[cacheType]) {
      this._views[cacheType] = this.createView();
      if (cacheType === VIEW_TYPES.play) {
        this.addViewEvent(this._views[cacheType]);
      }
    }
    if (this._views[cacheType]) {
      this._views[cacheType].refId = `${this.id}@${cacheType}`;
      this._views[cacheType].zIndex = this.zIndex;
    }
    return this._views[cacheType];
  }

  /*
   * avoid duplicate calls of draw in a single frame
   */
  async unidraw(absTime, type) {
    const key = `${absTime}@${type}`;
    if (!this._drawing[key]) {
      this._drawing[key] = new Promise(async (resolve) => {
        await this.beforeDraw(absTime, type);
        let view = await this.draw(absTime, type);
        view = await this.afterDraw(view, absTime, type);
        resolve(view);
        delete this._drawing[key];
      });
    }
    return this._drawing[key];
  }

  async beforeDraw(absTime, type) {
    // for hook
  }

  async afterDraw(view, absTime, type) {
    // for hook
    return view;
  }

  async draw(absTime, type) {
    const view = this.getView(absTime, type);
    if (!view) return;
    if (this.onDraw(absTime)) {
      if (this.getConf('enableAudioAnalyser')) {
        await this.player.audioAnalyserProcess(absTime);
      }
      // apply animation
      const attr = this.animationAttr(absTime);
      view.animationAttrChange = JSON.stringify(attr) !== JSON.stringify(view.animationAttr);
      view.animationAttr = attr; // 给之后处理用
      if (Object.keys(attr).length > 0) {
        view.attr(attr);
      }

      if (this.asMask) {
        view.binaryMask = !!this.getConf('binaryMask');
        view.reverseMask = !!this.getConf('reverseMask');
        this.parent.setMask(absTime, type, view);
      } else {
        const vp = this.getViewParent(absTime, type);
        // console.log('onDraw', this.id, absTime, vp?.refId);
        if (vp) vp.addView(view);
      }
      return view;
    } else {
      if (this.asMask) {
        this.parent.setMask(absTime, type, null);
      } else if (view.parent) {
        view.parent.removeView(view);
      }
      return;
    }
  }

  get asMask() {
    return this.getConf('asMask', false);
  }

  get covers() {
    return this._covers || [];
  }

  get groupId() {
    return this.conf.groupId;
  }

  createView() {}

  updateView() {
    const view = this.parent ? this.getView() : null;
    // clear other type cache
    for (const [k, v] of Object.entries(this._views)) {
      if (!v || v === view) continue;
      try {
        if (v.parent) v.parent.removeChild(v);
        v.destroy(true);
      } catch (e) {}
      delete this._views[k];
    }
    return view;
  }

  defaultVal(key) {
    return DEFAULT_CONF[key];
  }

  getConf(key, autounit=true, absTime=null) {
    if (['parent', 'nextSibling', 'prevSibling'].includes(key)) return this[key];
    if (this.keyframe?.keyFrames[key]) { // has keyframe value
      absTime = absTime || this.player.currentTime;
      const keyFrameAttr = this.keyframe.renderAttr(absTime - this.absStartTime, this);
      return keyFrameAttr[key];
    }
    return this.getRawConf(key, autounit, absTime);
  }

  getRawConf(key, autounit=true, absTime=null) {
    if (!key || typeof(key) !== 'string' || !this.conf) return undefined;
    autounit = !this.forceNoUnit(key) && autounit;

    const defaultVal = this.defaultVal(key);
    let val;
    if (!key.includes('.')) {
      val = this.conf[key] === undefined ? defaultVal : this.conf[key];
    } else {
      let obj = this.conf;
      for (const k of key.split('.')) {
        if (typeof(obj) !== 'object') {
          obj = undefined;
          break;
        }
        obj = obj[k];
      }
      val = obj === undefined ? defaultVal : obj;
    }
    if (typeof(val) === 'object' && val.innerHTML) val = val.innerHTML;
    return autounit ? this.px(val) : val;
  }

  setConf(key, value, autounit=true, absTime=null) {
    if (!key || typeof(key) !== 'string') throw new Error(`Invalid key: ${key}`);
    if (['nextSibling', 'prevSibling'].includes(key)) {
      return this[key] = value;
    } else if (key === 'parent' && value !== this.parent) {
      if (this.parent) {
        // remove view
        const view = this.getView();
        if (view && view.parent) view.parent.removeView(view);
        // remove parent
        const parent = this.parent;
        parent.removeChild(this);
      }
      if (value && value.type) {
        value.addChild(this, this.nextSibling);
      }
      return;
    } else if (this.keyframe?.keyFrames[key]) {
      // has keyframe value
      return this.setKeyFrame({ [key]: value }, absTime || this.player.currentTime);
    }

    autounit = !this.forceNoUnit(key) && autounit;
    // console.log('setConf', {key, value, vu: this.vu(key, value)});
    if (autounit) value = this.vu(key, value);
    let obj = this.conf;
    if (!key.includes('.')) return obj[key] = value;
    let ks = key.split('.');
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (i === ks.length - 1) return obj[k] = value;
      if (typeof(obj[k]) !== 'object') obj[k] = isNaN(ks[i+1]) ? {} : [];
      obj = obj[k];
    }
  }

  units() {
    const root = this.root();
    if (root) {
      this.canvasWidth = root.width;
      this.canvasHeight = root.height;
    }
    return [
      ['rpx', this.canvasWidth, 360],
      ['px', 360, 360],
      ['vw', this.canvasWidth, 100],
      ['vh', this.canvasHeight, 100]
    ];
  }

  forceNoUnit(key) {
    return ['refId', 'id'].includes(key);
  }

  vu(key, val) {
    if (val && typeof(val) === 'object') { // null is a object
      return Utils.dmap(val, (v, k, ks) => {
        // console.log({v, k, ks});
        return this.vu(ks.join('.'), v);
      }, [key]);
    } else {
      let [vnum, unit] = this.deunit(val);
      if (!unit) {
        // 若无单位，取当前设置的单位
        const [_, runit] = this.deunit(this.getConf(key, false));
        unit = runit;
      }
      return unit ? this.enunit(vnum, unit) : val;
    }
  }

  px(val) {
    if (typeof val === 'boolean') return val;
    const num = Number(val);
    if (!isNaN(num)) return num;
    if (typeof(val) === 'object') return Utils.dmap(val, x => this.px(x));
    const [inum, unit] = this.deunit(val);
    return inum;
  }

  /**
   * 把px单位的数值, 转换为给定unit单位的值
   * 返回数字/字符串
   */
  enunit(px, unit) {
    const ut = this.units().filter(ut => ut[0] === unit)[0];
    if (!ut) return px;
    let val = (px * ( ut[2] / ut[1])).toFixed(3);
    if (Math.abs(val - Math.round(val)) < 0.001) val = Math.round(val);
    return `${val}${unit}`;
  }

  /**
   * 把某单位的数值，转换为px的值
   * 返回数组 [num_px, unit]
   */
  deunit(data) {
    if (typeof(data) === 'number' || !data) return [data, null];
    const lower_data = data.toString().toLowerCase().trim();
    const unit = (input, unit, original, target) => {
      if (!input.endsWith(unit)) return null;
      const inum = Number(input.substring(0, input.length - unit.length));
      return isNaN(inum) ? null : inum * (original / target);
    }

    for (const ut of this.units()) {
      const inum = unit(lower_data, ut[0], ut[1], ut[2]);
      if (inum !== null) return [inum, ut[0]];
    }
    return [!isNaN(data) ? Number(data) : data, null];
  }

  /**
   * load remote resource
   */
  preload(onprogress) {}

  annotate() {
    let [ start, end ] = [ this.absStartTime, this.absEndTime ];
    const vc = this.viewContainer;
    if (this.prevSibling?.type === 'trans') {
      if (this.prevSibling.nextSibling === this) {
        // 后面一个node是有可能没对齐的前一个的(不在spine里的情况)
        const dt = start - this.prevSibling.absEndTime;
        const halfTrans = (this.prevSibling.duration * 0.5) - dt;
        start -= halfTrans;
      } else { // 可能是trans已经移走了，而脏指针还留着
        this.prevSibling = null;
      }
    } else if (vc.absDrawStartTime < vc.absStartTime && start <= vc.absStartTime) {
      // 处理scene里的children可能需要补时间
      start = Math.min(start, vc.absDrawStartTime);
    }

    if (this.nextSibling?.type === 'trans') {
      if (this.nextSibling.prevSibling === this) {
        const halfTrans = this.nextSibling.duration * 0.5;
        end += halfTrans;
      } else { // 可能是trans已经移走了，而脏指针还留着
        this.nextSibling = null;
      }
    } else if (vc.absDrawEndTime > vc.absEndTime && end >= vc.absEndTime) {
      // 处理scene里的children可能需要补时间
      end = Math.max(start, vc.absDrawEndTime);
    }

    this.absDrawStartTime = start;
    this.absDrawEndTime = end;

    this.onDraw = (absTime) => {
      // draw: 开始渲染，有可能是转场过程补帧
      return (absTime >= start && absTime < end && this.active);
    }
  }

  onTime() {
    return this.onDraw(this.player.currentTime);
  }

  onShow(absTime) {
    // show: 正式开始播放，发声
    return (absTime >= this.absStartTime && absTime < this.absEndTime && this.active);
  }

  addChild(child, insertBefore=null) {
    if (Array.isArray(child)) {
      child.map(x => this.addChild(x, insertBefore));
      return this;
    }
    if (this.hasChild(child)) {
      if (insertBefore && this.hasChild(insertBefore)) {
        this.children = this.children.filter(x => x.id !== child.id); // remove
        this.children.splice(this.children.findIndex(x => x.id == insertBefore.id), 0, child);
      }
      return this;
    }
    child.parent = this;
    if (insertBefore && this.hasChild(insertBefore)) {
      this.children.splice(this.children.findIndex(x => x.id == insertBefore.id), 0, child);
    } else {
      this.children.push(child);
    }
    return this;
  }

  remove() {
    this.parent && this.parent.removeChild(this);
    return this;
  }

  hasChild(child) {
    return !!this.children.find(x => x.id == child?.id);
  }

  removeChild(child) {
    if (!this.hasChild(child)) return this;
    this.children = this.children.filter(x => x.id !== child.id);
    child.parent = null;
    return this;
  }

  root() {
    if (!this.parent || !this.parent.root) return;
    return this.parent.root();
  }

  get viewContainer() {
    let parent = this.parent;
    while (parent && !parent.isViewContainer) {
      parent = parent.parent;
    }
    return parent;
  }

  getViewParent(time, type) {
    const container = this.viewContainer;

    let cover;
    container.covers.map(c => {
      if (!c.onDraw(time) || c === this ||
          (cover && c.zIndex > cover.zIndex) || c.zIndex < this.zIndex) return;
      cover = c;
    });

    let trans;
    if (this.prevSibling?.type === 'trans' && this.prevSibling.onDraw(time)) {
      trans = this.prevSibling;
    } else if (this.nextSibling?.type === 'trans' && this.nextSibling.onDraw(time)) {
      trans = this.nextSibling;
    }

    return (trans || cover || container).getView(time, type);
  }

  get allNodes() {
    let nodes = this.children;
    this.children.map(x => {
      nodes = nodes.concat(x.allNodes);
    });
    return nodes;
  }

  getByRefId(refId) {
    return this.allNodes.find(x => x.refId === refId);
  }

  get absStartTime() {
    return this.rt(Math.max(0, this.parent?.absStartTime + this.startTime));
  }

  get absEndTime() {
    return this.rt(this.parent?.absStartTime + this.endTime);
  }

  get realAbsEndTime() {
    return this.rt(this.parent?.absStartTime + this.realEndTime);
  }

  get default() {
    return {
      startTime: (this.parent?.type === 'spine' ? this.prevSibling?.endTime : 0) || 0,
      endTime: '100%',
    }
  }

  get startTime() {
    let start = this.getRawConf('start', false);
    start = this.time(start);
    return this.rt(!isNaN(start) ? start : this.time(this.default.startTime));
  }

  get duration() {
    return this.rt(this.endTime - this.startTime);
  }

  get endTime() {
    const endTime = this.realEndTime;
    if (this.parent?.type !== 'scene') return this.rt(endTime);
    // scene的子元素，会被截到跟它一样长
    return this.rt(Math.min(this.parent.duration, endTime));
  }

  get realEndTime() {
    let duration = this.getRawConf('duration', false);
    let end = this.getRawConf('end', false);
    end = this.time(end);
    if (!isNaN(end)) return end;
    duration = this.time(duration);
    duration = !isNaN(duration) ? duration : this.time(this.default.duration);
    if (!isNaN(duration)) return this.startTime + duration;
    const defaultEnd = this.time(this.default.endTime);
    if (defaultEnd > this.startTime) return defaultEnd;
    return this.startTime + (this.material?.length || 3); // 默认3秒
  }

  get flexibleDuration() {
    const duration = this.getRawConf('duration', false);
    const end = this.getRawConf('end', false);
    return (duration && duration.toString().includes('%'))
     || (end && end.toString().includes('%'))
     || (!duration && !end);
  }

  get fps() {
    if (!this._fps) this._fps = this.root().getConf('fps', false);
    return this._fps;
  }

  get basezIndex() {
    return Math.min(Number(this.getConf('zIndex', false)), 9999) * 10000 || this.parent?.basezIndex || 0;
  }

  rt(time) {
    // 不能用floor，不然变化过程中会越减越小
    return Math.round(time * 1000) / 1000;
  }

  time(time) {
    const parentDuration = this.parent ? this.parent.duration : NaN;
    if (typeof(time) === 'string' && time.endsWith('%') && !isNaN(time.replace('%', ''))) {
      return parentDuration * Number(time.replace('%', '')) * 0.01;
    }
    if (typeof(time) === 'string') {
      time = time.replaceAll(' ', '');
      if (time.toLowerCase() === 'contain' && this.material?.length) {
        return this.material.length;
      } else if (time.includes('%+') && time.split('%+').length === 2) {
        const [ head, tail ] = time.split('%+');
        return Number(head) * 0.01 * parentDuration + Number(tail);
      } else if (time.includes('%-') && time.split('%-').length === 2) {
        const [ head, tail ] = time.split('%-');
        return Number(head) * 0.01 * parentDuration - Number(tail);
      }
    }
    return Number(time);
  }

  getRenderer(type) {
    return this.player.getRenderer(type);
  }

  animationAttr(absTime) {
    const attr = {};
    const kf = this.keyframe;
    if (kf) {
      const nodeTime = absTime - this.absStartTime; // use node time
      const keyFrameAttr = kf.renderAttr(nodeTime, this);
      Object.assign(attr, keyFrameAttr);
    }
    const aMotion = this.getConf('amotion')
    if (this.getConf('enableAudioAnalyser') && aMotion) {
      if (aMotion instanceof Array) {
        for (const item of aMotion) {
          const func = (typeof(this[item.funcName]) === 'function') ? this[item.funcName] : this.defaultAmotionAttr
          const aMotionAttr = func.call(this, item)
          Object.assign(attr, aMotionAttr);
        }
      } else {
        const func = (typeof(this[aMotion.funcName]) === 'function') ? this[aMotion.funcName] : this.defaultAmotionAttr
        const aMotionAttr = func.call(this, aMotion)
        Object.assign(attr, aMotionAttr);
      }
    }
    return attr;
  }

  get keyframe() {
    if (this._keyframe !== undefined) return this._keyframe;
    const kfs = this.conf.keyframes;
    this._keyframe = kfs ? new KeyFrames(this.px(kfs)) : null;
    return this._keyframe;
  }

  setKeyFrame(attrs, absTime) {
    if (absTime === undefined) absTime = this.player.currentTime;
    const time = (absTime - this.absStartTime).toFixed(2); // time: nodeTime
    let kfs = this.getConf('keyframes', false);
    if (kfs && !Array.isArray(kfs)) kfs = [kfs];
    else if (!kfs) kfs = [];

    const _attrs = {};
    for (const [key, val] of Object.entries(attrs)) {
      // remove exist keyframe set
      const kf = kfs.find(kf => kf.time == time && kf[key] !== undefined);
      if (kf) delete kf[key];
      // set value
      if (val !== undefined) _attrs[key] = this.vu(key, val);
    }

    // filter empty keyframe
    kfs = kfs.filter(kf => Object.keys(kf).length > 1);

    // add new keyframe
    if (Object.keys(_attrs).length > 0) kfs.push({ time, ..._attrs });

    // set conf
    if (kfs.length > 0) this.conf.keyframes = kfs;
    else this.conf.keyframes = undefined;

    // update _keyframe
    if (this._keyframe) this._keyframe.destroy();
    this._keyframe = kfs.length > 0 ? new KeyFrames(this.px(kfs)) : null;
    return kfs;
  }

  volume(absTime) {
    const fadeIn = this.getConf('fadeIn', false) || this.getConf('afadeIn', false);
    const fadeOut = this.getConf('fadeOut', false) || this.getConf('afadeOut', false);
    let volume = this.getConf('volume', false);

    if (this.keyframe?.keyFrames.volume) {
      const attr = this.animationAttr(absTime);
      if (attr.volume !== undefined) volume = attr.volume;
    }

    const nodeTime = absTime - this.absStartTime;
    if (fadeOut && (this.duration - nodeTime) < fadeOut) {
      volume *= (this.duration - nodeTime) / fadeOut;
    } else if (fadeIn && nodeTime < fadeIn) {
      volume *= nodeTime / fadeIn;
    }

    return volume;
  }

  get hasAudio() {
    return false;
  }

  async getAudioFrame(absTime, frameSize) {
    if (!this.material || !this.onShow(absTime) || !this.hasAudio) return {};
    const volume = this.volume(absTime);
    if (volume <= 0) return {};
    const nodeTime = absTime - this.absStartTime;
    const audioFrame = await this.material.getAudioFrame(nodeTime, frameSize);
    return { volume, audioFrame };
  }

  draftChildren() {
    return this.children;
  }

  toJson(asTemplate=false) {
    const conf = JSON.parse(JSON.stringify(this.conf));
    for (const key of Object.keys(conf)) {
      if (key.startsWith('cached') && conf[key]?.startsWith('blob:')) delete conf[key];
    }
    delete conf.srcFile;
    delete conf.innerHTML;
    const children = this.draftChildren();
    if (children && Array.isArray(children)) {
      conf.children = children.map(c => c.toJson(asTemplate));
    }
    const removeInnerHTML = (x) => {
      if (!x) return;
      const val = x.innerHTML;
      for (const [k, v] of Object.entries(x)) {
        if (k === 'innerHTML' || k === '_nodeName' || k === '_type') delete x[k];
        else if (v && typeof(v) === 'object') {
          x[k] = removeInnerHTML(v);
        }
      }
      if (Object.keys(x).length === 1 && x.type && val) return val;
      return x;
    }
    removeInnerHTML(conf);
    return conf;
  }

  clearViewCache() {
    if (this._views) {
      Object.values(this._views).map(v => {
        if (!v) return;
        try {
          v.interactive = false;
          // todo: clear events
          if (v.parent) v.parent.removeChild(v);
          v.destroy(true);
        } catch (e) {}
      });
    }
    this._views = {};
  }

  addViewEvent(view) {
    if (!view || !(view instanceof DisplayObject)
       || this.isViewContainer || this.conf.editable === false) {
      return;
    }
    view.interactive = true;
    if (this._events) {
      // todo: unbind old events;
    }
    this._events = {
      hover: this.onHover(),
      movestart: this.onMoveStart(),
      moveend: this.onMoveEnd(),
    };
    for (const [k, evts] of Object.entries(VIEW_EVENTS)) {
      for (const evt of evts) {
        view.on(evt, this._events[k]);
      }
    }
  }

  onHover(player) {
    return (e) => {
      e.stopPropagation();
      e.target = this;
      this.player.emit('hover', e);
    }
  }

  onMoveStart() {
    return (e) => {
      e.stopPropagation();
      e.target = this;
      this.player.emit('movestart', e);
    }
  }

  onMoveEnd() {
    return (e) => {
      e.stopPropagation();
      e.target = this;
      this.player.emit('moveend', e);
    }
  }

  async previewImage(time, opts={}) {
    return await this.player.getPreviewImage(this, time, opts);
  }

  initzIndex(ref={zIndex:1}) {
    this.zIndex = this.basezIndex + (ref.zIndex++);
    this.children.map(x => x.initzIndex(ref));
  }

  destroy() {
    this.removeAllListeners();
    this.destroied = true;
    this.clearViewCache();
    this.conf = null;
    this._drawing = null;
    if (this.children) this.children.map(c => c.destroy());
    this.children = null;
    if (this.material) this.material.destroy();
    this.material = null;
    if (this._keyframe) this._keyframe.destroy();
    this._keyframe = null;
    this.parent = null;
  }
}

Clip.extends(AnimationNode);

export default Clip;