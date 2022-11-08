import { Texture, BaseTexture, Sprite } from "pixi.js";
import Display from "./display";
import ViewNode from "../mixin/view";
import FrameNode from "../mixin/frame";
import ImageMaterial from "../material/image";

class Image extends Display {
  constructor(conf) {
    super({type: 'image', ...conf});
  }

  async preload(onprogress) {
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
}

Image.extends(ViewNode);
Image.extends(FrameNode);

export default Image;