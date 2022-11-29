import Clip from "../core/clip";
import ViewNode from "../mixin/view";
import { Graphics, utils, settings, Texture, Sprite, BaseTexture, Rectangle } from 'pixi.js'

const DEFAULT_CONF = {
  'x': 0, 'y': 0, anchor: [0, 0],
};

// todo: graph的问题很大，渲染效率也很低

class Graph extends Clip {
  constructor(conf) {
    super({type: 'graph', ...conf});
  }

  get viewAttrKeys() { // for view mixin
    return ['x', 'y', 'anchor', 'rotation'];
  }

  createView() {
    const view = new Graphics();
    this.render(view, 0);
    if (this.getConf('blur') > 0) {
      const { width, height } = this.player;
      const canvas = settings.ADAPTER.createCanvas(width, height);
      const sprite = new Sprite(new Texture(BaseTexture.from(canvas)));
      sprite.graphSource = view;
      return sprite;
    }
    return view;
  }

  render(view, absTime) {
    view.clear();
    const shape = this.getConf('shape');
    if (typeof shape === 'string') {
      this.drawShape(view, shape, this);
    } else if (typeof shape === 'object') {
      const shapes = Array.isArray(shape) ? shape : [shape];
      shapes.map(s => this.drawShape(view, s.type, s));
    }
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (!view) return;

    if (view.animationAttrChange) {
      this.render(view.graphSource || view, absTime);
      view.rendered = false;
    }

    if (view instanceof Sprite && view.graphSource && !view.rendered) {
      // todo: 也可以用filter来blur，不需要导出canvas所以效率会高，但不太好看
      const canvas = view.source;
      const renderer = this.getRenderer(type);
      const frame = new Rectangle(0, 0, canvas.width, canvas.height);
      const img = renderer.plugins.extract.canvas(view.graphSource, frame);
      const ctx = canvas.getContext('2d');
      const blur = this.getConf('blur');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      view.source = canvas;
      view.rendered = true;
    }

    return view;
  }

  get fillColor() {
    return utils.string2hex(this.getConf('color') || '#000000');
  }

  getAttrConf(attrs, key) {
    if (Array.isArray(key)) {
      const conf = {};
      for (const k of key) {
        conf[k] = this.getAttrConf(attrs, k);
      }
      return conf;
    }
    return attrs.getConf ? attrs.getConf(key) : attrs[key];
  }

  drawShape(view, type, attrs) {
    if (!view || !type || !this[`draw${type}`]) return;
    const color = this.getAttrConf(attrs, 'color');
    if (color) {
      const colorAlpha = this.getAttrConf(attrs, 'colorAlpha');
      view.beginFill(utils.string2hex(color), colorAlpha);
    } else {
      view.beginFill(this.fillColor);
    }
    this[`draw${type}`](view, attrs);
    view.endFill();
  }

  drawCircle(view, attrs) {
    const {x, y, radius} = this.getAttrConf(attrs, ['x', 'y', 'radius']);
    view.drawCircle(x, y, radius);
  }

  drawEllipse(view, attrs) {
    const {x, y, width, height} = this.getAttrConf(attrs, ['x', 'y', 'width', 'height']);
    view.drawEllipse(x, y, width, height);
  }

  drawRoundedRect(view, attrs) {
    const {x, y, width, height, radius} = this.getAttrConf(attrs, ['x', 'y', 'width', 'height', 'radius']);
    view.drawRoundedRect(x, y, width, height, radius);
  }

  defaultVal(key) {
    if (DEFAULT_CONF[key] !== undefined) {
      return DEFAULT_CONF[key];
    }
    return super.defaultVal(key);
  }

}

Graph.extends(ViewNode);

export default Graph;