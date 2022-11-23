import { Texture, BaseTexture, Sprite, settings, DisplayObject } from "pixi.js";
import Display from "./display";
import ViewNode from "../mixin/view";
import FrameNode from "../mixin/frame";
import Builder from "../core/builder";
import STATIC from "../core/static";
import Utils from '../util/utils';
import PluginUtil from '../util/plugin';

class Mixin extends Display {
  constructor(conf) {
    super({...conf, type: 'mixin'});
  }

  async initMixin(type, mixin) {
    PluginUtil.extends({plugin: mixin, to: this});
    this.mixinType = type;
    this.id = Utils.genId(type); // re-gen id
    if (this.createNode) {
      let node = this.createNode();
      if (!(typeof(node) === 'object' && node.annotate)) {
        const {node: _node, cachePromise} = Builder.from(node);
        await cachePromise;
        node = _node;
      }
      this.node = node;
      this.addChild(node);
    }
  }

  defaultVal(key) {
    let value;
    if (this.defaultConf) {
      value = this.defaultConf(key)
    }
    return (value === undefined) ? super.defaultVal(key) : value;
  }

  get material() {
    return this.node?.material || this;
  }

  get width() {
    return Math.floor(this.getConf('width'))
  }

  get height() {
    return Math.floor(this.getConf('height'))
  }

  createView() {
    if (this.node) {
      return super.createView();
    } else if (this.createPixiView) {
      return this.createPixiView();
    } else {
      const { width, height } = this;
      const canvas = settings.ADAPTER.createCanvas(width || 100, height || 100);
      return new Sprite(new Texture(BaseTexture.from(canvas)));
    }
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (view && this.render) {
      const nodeTime = absTime - this.absStartTime;
      const playing = (type === STATIC.VIEW_TYPE_PLAY);
      await this.render(nodeTime, playing, view);
    }
    return view;
  }
}

Mixin.extends(ViewNode);
Mixin.extends(FrameNode);

export default Mixin;