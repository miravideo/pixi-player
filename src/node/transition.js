import { Filter as PIXIFilter, settings, Sprite, RenderTexture, Texture, BaseTexture } from "pixi.js";
import Clip from '../core/clip';
import STATIC from "../core/static";
import ShaderManager from '../util/shader';
import TransitionFilter from '../util/transition';
import Utils from "../util/utils";

class Transition extends Clip {
  constructor(conf) {
    super({...conf, type: 'trans'});
  }

  preload() {
    this.source = ShaderManager.getShaderByName(this.getConf('key'));
  }

  annotate() {
    this._duration = this.duration;
    this.absDrawStartTime = this.absStartTime;
    this.absDrawEndTime = this.absDrawStartTime + this._duration;
    this.onDraw = (absTime) => {
      return (absTime >= this.absDrawStartTime && absTime < this.absDrawEndTime && this.active);
    }

    // 设置zIndex为前后2个node中【低】的那个，避免转场过程把原先低的上面覆盖的东西挡住 (之前+1是为了draw的顺序)
    // 取【高】的可能会挡住原先上面的东西，取【低】的可能会让原先下面的露出来，因为转场一般是底层画面，所以取【低】指
    this.zIndex = Math.min(this.prevSibling?.zIndex || 0, this.nextSibling?.zIndex || 0);
  }

  createView() {
    const { width, height } = this.root();
    const canvas = settings.ADAPTER.createCanvas(width, height);
    const view = new Sprite(new Texture(BaseTexture.from(canvas)));
    const filter = new TransitionFilter(this.source);

    // 只能用root的ratio，否则可能会被拉伸
    filter.ratio = width / height;

    // 需要用Sprite来承接渲染
    const prevTexture = RenderTexture.create({width, height});
    const nextTexture = RenderTexture.create({width, height});
    filter.prev = new Sprite(prevTexture);
    filter.next = new Sprite(nextTexture);
    view.addView(filter);
    view.addView = (v) => {
      // 禁止再添加child
      if (v.parent) {
        // console.log('addView to trans', v.refId, '->', this.id);
        v.parent.removeView(v);
      }
    }
    return view;
  }

  refresh() {
    if (!this.parent) {
      this.prevSibling = null;
      this.nextSibling = null;
    } else if (this.parent.type !== 'spine') {
      const prevSibling = this.prevRefId && this.prevRefId != this.refId ?
                          this.root().getByRefId(this.prevRefId) : null;
      if (prevSibling) {
        this.prevSibling = prevSibling;
        this.prevSibling.nextSibling = this;
      }
      const nextSibling = this.nextRefId && this.nextRefId != this.refId ?
                          this.root().getByRefId(this.nextRefId) : null;
      if (nextSibling && nextSibling != this.prevSibling) {
        this.nextSibling = nextSibling;
        this.nextSibling.prevSibling = this;
      }
    }
  }

  get default() {
    return {
      startTime: this.prevSibling?.endTime || 0,
      duration: 1
    };
  }

  get duration() {
    let duration = this.time(this.conf.duration);
    return !isNaN(duration) ? duration : this.time(this.default.duration);
  }

  get startTime() {
    if (!this.prevSibling) return super.startTime;
    // 相对前一个sibling的结束，往前倒 0.5*duration 作为开始
    return Math.max(0, (this.relativeEndTime - this.duration * 0.5) || 0);
  }

  get endTime() {
    if (!this.prevSibling) return super.startTime;
    // 让后面的node, 也同时开始
    return Math.max(0, (this.relativeEndTime || 0));
  }

  get relativeEndTime() {
    // 考虑spine外面的情况，需要用absEndTime
    return (this.prevSibling?.absEndTime - this.parent.absStartTime);
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (!view || !view.filters?.length) return;
    const filter = view.filters[0];
    const fit = this.getConf('fit');
    const bounds = { 'prev': null, 'next': null };
    const keys = ['prev', 'next'];

    await Promise.all(keys.map(async (k) => {
      const siblingNode = this[`${k}Sibling`];
      if (!siblingNode) return;
      return siblingNode.unidraw(absTime, type);
    }));

    for (const k of keys) {
      const siblingNode = this[`${k}Sibling`];
      if (!siblingNode) continue;
      const sv = siblingNode.getView(absTime, type);
      if (!sv) continue;
      this.getRenderer(type).render(sv, {renderTexture: filter[k].texture});
      if (fit) bounds[k] = sv.getBounds();
    }

    if (fit) {
      // console.log('rect1', this.id, `${this.prevSibling?.id} ${rect1}`);
      // console.log('rect2', this.id, `${this.nextSibling?.id} ${rect2}`);
      const rect = bounds['prev'] || bounds['next'];
      if (bounds['prev'] && bounds['next']) rect.enlarge(bounds['next']);

      const { width, height } = this.root();
      const attrs = {};
      attrs.width = rect ? rect.width : width;
      attrs.height = rect ? rect.height : height;
      attrs.x = rect ? rect.left : 0;
      attrs.y = rect ? rect.top : 0;
      if (!Utils.deql(view, attrs)) {
        view.attr(attrs);
        // todo: offset还没实现shader代码
        filter.offset = [
          - ((width * 0.5) - (attrs.x + (attrs.width * 0.5))) / width,
          ((height * 0.5) - (attrs.y + (attrs.height * 0.5))) / height,
        ];
        // console.log('resize trans!!', attrs);
      }
    }

    filter.params = this.getConf('params') || {};
    filter.updateProgress((absTime - this.absDrawStartTime) / this._duration);
  }

}

export default Transition;