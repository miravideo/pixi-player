import { Texture, BaseTexture, Sprite } from "pixi.js";
import Display from "./display";
import ViewNode from "../mixin/view";
import FrameNode from "../mixin/frame";
import ImageMaterial from "../material/image";

const EDITABLE_CONF = {
  fitable: true, cropable: true, flipable: "x",
};

class Image extends Display {
  constructor(conf) {
    super({type: 'image', ...conf});
  }

  async preload(onprogress) {
    if (this.material) this.material.destroy();
    this.material = this.createMaterial();
    await this.material.init(onprogress);
  }

  createMaterial() {
    return new ImageMaterial(this);
  }

  createView() {
    return new Sprite(new Texture(BaseTexture.from(this.material.createCanvas())));
  }

  async draw(absTime, type) {
    const view = await super.draw(absTime, type);
    if (!view) return;
    await this.material.render(absTime - this.absStartTime, type, view);
    return view;
  }

  defaultVal(key) {
    // for gif loop
    if (key === 'loop' && this.type === 'image') return true;
    if (EDITABLE_CONF[key] !== undefined) return this.asMask ? false : EDITABLE_CONF[key];
    return super.defaultVal(key);
  }
}

Image.extends(ViewNode);
Image.extends(FrameNode);

export default Image;