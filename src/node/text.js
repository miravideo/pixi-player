import Display from "./display";
import ViewNode from "../mixin/view";
import { EditableText } from "../util/editable-text";
import STATIC from "../core/static";
import md5 from "md5";

const LOAD_FONTS = {};
const ALIGN_MAP = { left: 0, center: 0.5, right: 1 };
const VALIGN_MAP = { top: 0, center: 0.5, bottom: 1 };
const STYLE_KEYS = [
  'selectionBgColor',
  'fill', 'fontFamily', 'fontSize', 'backgroundColor',
  'align', 'valign', 'lineHeight', 'letterSpacing', 'padding',
  'wordWrapWidth', 'wordWrap', 'breakWords', 'lineJoin',
  'stroke', 'strokeThickness',
  'dropShadow', 'dropShadowColor', 'dropShadowAlpha', 
  'dropShadowBlur', 'dropShadowDistance', 'dropShadowAngle', 'dropShadowContain'
];

const DEFAULT_CONF = {
  align: 'center', valign: 'center', fontSize: '10rpx', color: '#FFFFFF',
  breakWords: true, wrap: true, wordWrap: true, lineJoin: 'round', 
  strokeThickness: '5%', dropShadowAlpha: 0.6, dropShadowDistance: '10%',
  dropShadowBlur: '20%', dropShadowAngle: '45deg', dropShadowContain: true,
};

class Text extends Display {
  constructor(conf) {
    super({type: 'text', ...conf});
  }

  async preload(onprogress) {
    this.fontKey = await this.loadFont();
  }

  createView() {
    return new EditableText(this.text);
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (!view) return;

    view.text = this.text; // update
    if (this.getConf('width')) view.targetWidth = this.getConf('width');
    if (this.getConf('height')) view.targetHeight = this.getConf('height');
    const style = this.getStyle(view.animationAttr);
    for (const [k, v] of Object.entries(style)) {
      if (v !== undefined) view.style[k] = v;
    }
    // 如果style没有更新，不会触发重渲染
    view.updateText(true);

    // todo: update width/height ?
    // this.setConf('height', this.display.height);
    // if (!this.confAttr.width) {
    //   // 如果没有宽，就设置一下，避免之后一直变动
    //   this.setConfRpx('width', this.display.width);
    // }

    this.setAlign();

    // console.log('xxx', this.id, view.width, view.height, view.scale);

    return view;
  }

  getStyle(animationAttr) {
    const style = {};
    for (const key of STYLE_KEYS) {
      style[key] = animationAttr[key] !== undefined ? animationAttr[key] : (
        this[key] !== undefined ? this[key] : this.getConf(key)
      );
      // console.log(key, this[key], this.getConf(key), style[key]);
    }
    // console.log('getStyle', style);
    return style;
  }

  px(val, needRound= true) {
    if (typeof(val) === 'string' && val.endsWith('%') && !isNaN(val.replace('%', ''))) {
      const res = this.fontSize * Number(val.replace('%', '')) * 0.01;
      return needRound? Math.round(res) : res;
    }
    return super.px(val);
  }

  vu(key, val, unitReferValue) {
    if (typeof(val) === 'string' && val.endsWith('%')) return val;
    const px = this.px(val);
    if (typeof(unitReferValue) === 'string' && unitReferValue.endsWith('%') && !isNaN(px)) {
      return `${Math.round(100 * (px / this.fontSize))}%`;
    } else {
      return super.vu(key, val, unitReferValue);
    }
  }

  forceNoUnit(key) {
    return [
      'text', 'content', 'fontFamily', 'wordWrap', 'backgroundColor', 'stroke'
    ].includes(key)
     || super.forceNoUnit(key);
  }

  get text() {
    return this.getConf('text', false) || this.getConf('content', false);
  }

  get fontFamily() {
    return this.fontKey || undefined;
  }

  get fontSize() {
    // 避免递归死循环
    return super.px(this.getConf('fontSize', false));
  }

  get wordWrapWidth() {
    let width = this.getConf('width');
    if (!width) return undefined;
    if (this.dropShadow) {
      // 因为阴影和描边也有宽度，所以在计算换行宽度的时候需要减掉这部分，否则会带来畸变
      const dropShadowDistance = this.getConf('dropShadowDistance') || 0;
      const dropShadowBlur = this.getConf('dropShadowBlur') || 0;
      const dropShadowAngle = this.dropShadowAngle;
      const shadowOffsetX = Math.abs(Math.cos(dropShadowAngle) * dropShadowDistance) + dropShadowBlur;
      width -= (shadowOffsetX + (this.getConf('strokeThickness') || 0))
         * (this.getConf('align') === 'center' ? 2 : 1);
    }
    return width;
  }

  get wordWrap() {
    return this.getConf('wrap', false) && this.wordWrapWidth > 0;
  }

  get fill() {
    return this.getConf('fill', false) || this.getConf('color', false);
  }

  get stroke() {
    return this.getConf('stroke', false) || this.getConf('strokeColor', false);
  }

  get strokeThickness() {
    return this.stroke ? this.getConf('strokeThickness') : 0;
  }

  get dropShadow() {
    return !!this.dropShadowColor;
  }

  get dropShadowColor() {
    return this.getConf('dropShadow', false) || this.getConf('dropShadowColor', false);
  }

  get dropShadowAngle() {
    let angle = this.getConf('dropShadowAngle', false);
    const deg = angle && angle.endsWith('deg');
    if (deg) angle = Number(angle.replace('deg', '')) * (Math.PI / 180);
    return angle;
  }

  get font() {
    return this.getConf('cachedFont', false) || this.getConf('font', false) || this.getConf('fontFamily', false);
  }

  async loadFont() {
    const { font } = this;
    if (!font) return null;
    if (!LOAD_FONTS[font]) {
      const fontKey = `f-${md5(font).substring(0, 6)}`;
      LOAD_FONTS[font] = new Promise(async (resolve) => {
        const fontFace = new FontFace(fontKey, `url("${font}")`);
        document.fonts.add(await fontFace.load());
        await document.fonts.ready;
        resolve(fontKey);
      });
    }
    return LOAD_FONTS[font];
  }

  setAlign(init=false) {
    // const { align, valign } = this;
    // const ax = ALIGN_MAP[align] !== undefined ? ALIGN_MAP[align] : 0.5;
    // const ay = VALIGN_MAP[valign] !== undefined ? VALIGN_MAP[valign] : 0.5;
    // if (this.anchorX != ax || this.anchorY != ay) {
    //   if (!init) {
    //     let { x, y, width, height } = this;
    //     x += (ax - this.anchorX) * width;
    //     y += (ay - this.anchorY) * height;
    //     this.setXY(x, y);
    //   }
    //   this.setAnchor(ax, ay);
    // }
  }

  get displayOffset() {
    // const view = this.getView();
    // const { width: dw, height: dh } = view;
    // const { x: ax, y: ay } = view.anchor;
    // let [ w, h ] = [this.getConf('width'), this.getConf('height')];
    // if (w === undefined) w = dw;
    // if (h === undefined) h = dh;
    // return { dx: (w - dw) * ax, dy: (h - dh) * ay };
    // text的canvas强制尺寸了，就不存在offset了
    return { dx: 0, dy: 0 };
  }

  selectStart(point) {
    // 转换为对display的坐标
    const { dx, dy } = this.displayOffset;
    this.getView().selectStart({ x: point.x - dx, y: point.y - dy });
  }

  selectEnd(point) {
    // 转换为对display的坐标
    const { dx, dy } = this.displayOffset;
    this.getView().selectEnd({ x: point.x - dx, y: point.y - dy });
    this.player.render(); // refresh
  }

  selectMove({x: dx, y: dy}, withShift, withCtrl) {
    this.getView().selectMove(dx, dy, withShift, withCtrl);
    this.player.render(); // refresh
  }

  selectClean() {
    const view = this.getView();
    view.selectStart({ x: 0, y: 0 });
    view.selectEnd({ x: 0, y: 0 });
    this.player.render();
  }

  delete() {
    return this.getView().delete();
  }

  selection() {
    return this.getView().selectionText();
  }

  input(text) {
    return this.getView().input(text);
  }

  cursor() {
    let { x, y, height } = this.getView().cursor();
    // 转换为对view的坐标
    const { dx, dy } = this.displayOffset;
    return { x: x + dx, y: y + dy, height };
  }

  defaultVal(key) {
    if (DEFAULT_CONF[key] !== undefined) {
      return DEFAULT_CONF[key];
    }
    return super.defaultVal(key);
  }

  getConf(key, autounit=true) {
    if (key === 'cursorIndex') {
      return this.getView().cursor().ci;
    }
    return super.getConf(key, autounit);
  }

  setConf(key, value, autounit=true) {
    if (key === 'cursorIndex') {
      return this.getView().cursor(value);
    }
    return super.setConf(key, value, autounit);
  }

  toJson(asTemplate=false) {
    const conf = super.toJson(asTemplate);
    conf.text = this.text;
    return conf;
  }

}

Text.extends(ViewNode);

export default Text;