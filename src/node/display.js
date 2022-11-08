import { Sprite, Texture, Graphics, BLEND_MODES, utils, filters } from 'pixi.js';
import { DropShadowFilter } from '@pixi/filter-drop-shadow';
import { OutlineFilter } from '@pixi/filter-outline';
import { GlowFilter } from '@pixi/filter-glow';
import Clip from '../core/clip';
import ChromaFilter from "../util/chroma";

class BorderFilter extends OutlineFilter {
  constructor(options) {
    const { size=1, color=0x000000, quality=0.1 } = options;
    super(size, color, quality);
  }
}

class Display extends Clip {
  constructor(conf) {
    super({type: 'display', ...conf});
  }

  createView() {
    return new Sprite(Texture.EMPTY);
  }

  applyCornerRadius(view, radius) {
    // todo: move to DisplayObject
    if (view.mask || !isFinite(radius) || radius <= 0) return;
    const mask = new Graphics();
    const { width, height } = view;
    mask.scale.x = 1 / view.scale.x;
    mask.scale.y = 1 / view.scale.y;
    const x = - width * view.anchor.x;
    const y = - height * view.anchor.y;
    mask.beginFill(0xFFFFFF);
    mask.drawRoundedRect(x, y, width, height, radius);
    mask.endFill();
    view.mask = mask;
    view.addChild(mask);
  }

  applyBlend(view, blend) {
    // todo: move to ViewNode?
    view.blendMode = BLEND_MODES[`${blend}`.toUpperCase()] || BLEND_MODES.NORMAL;
  }

  applyChroma(view, chroma) {
    if (!chroma) return;
    const conf = this.filterConf(chroma, 'key', { similarity: 0.2, smoothness: 0.1, saturation: 0.1, shadowness: 0.1 });
    const color = utils.string2hex(conf.key);
    conf.rgbColor = [ color >> 16, (color & 0xFF00) >> 8, color & 0xFF ];
    this.addFilter(view, ChromaFilter, conf);
  }

  applyShadow(view, shadow) {
    if (!shadow) return;
    const conf = this.filterConf(shadow, 'color');
    // auto quality for blur
    if (!conf.quality && conf.blur) {
      conf.quality = 2 + Math.round(conf.blur / 3);
    }
    this.addFilter(view, DropShadowFilter, conf);
  }

  applyGlow(view, glow) {
    if (!glow) return;
    const conf = this.filterConf(glow, 'color');
    // map short key
    if (conf.outer !== undefined) conf.outerStrength = conf.outer;
    if (conf.inner !== undefined) conf.innerStrength = conf.inner;
    this.addFilter(view, GlowFilter, conf);
  }

  applyBorder(view, border) {
    if (!border) return;
    const conf = this.filterConf(border, 'color');
    if (!conf.quality && conf.size) {
      conf.quality = Math.min(0.1 + Math.round(conf.size / 10), 1);
    }
    this.addFilter(view, BorderFilter, conf);
  }

  filterConf(conf, key, defaultVal=null) {
    let filterConf = defaultVal || {};
    if (typeof conf === 'string') {
      filterConf[key] = conf;
    } else if (typeof conf === 'object' && conf[key]) {
      filterConf = conf;
    }
    if (key === 'color') {
      filterConf.color = utils.string2hex(filterConf.color);
    }
    return filterConf;
  }

  addFilter(view, filterClass, filterConf) {
    let filter;
    if (Array.isArray(view.filters)) {
      filter = view.filters.find(x => x instanceof filterClass);
    }
    if (!filter) {
      filter = new filterClass(filterConf);
      view.addFilter(filter);
    } else {
      for (const [k, v] of Object.entries(filterConf)) {
        filter[k] = v;
      }
    }
  }

  async afterDraw(view, absTime, type) {
    view = await super.afterDraw(view, absTime, type);
    if (view) {
      this.applyCornerRadius(view, this.getConf('cornerRadius'));
      this.applyBlend(view, this.getConf('blend'));
      this.applyChroma(view, this.getConf('chroma'));
      this.applyBorder(view, this.getConf('border'));
      this.applyGlow(view, this.getConf('glow'));
      this.applyShadow(view, this.getConf('shadow'));
    }
    return view;
  }
}

export default Display;