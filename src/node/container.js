import Display from "./display";
import { Container as pixiContainer } from 'pixi.js'

class Container extends Display {
  constructor(conf) {
    super({type: 'container', ...conf});
    this._st = 0;
  }

  get isViewContainer() {
    return true;
  }

  async drawNodes(time, type) {
    const allChild = [...this.allNodes];
    allChild.sort((a, b) => a.zIndex - b.zIndex);
    await Promise.all(allChild.map(x => x.unidraw(time, type)));
  }

  async draw(time, type) {
    const view = await super.draw(time, type);
    if (!view) return;
    // covers should update before call drawNodes!
    this._covers = this.allNodes.filter(x => x.type === 'cover');
    await this.drawNodes(time, type);

    // offset as anchor(0.5, 0.5) when animate
    if (view.animationAttrChange && view.animationAttr.scale) {
      const attr = {};
      const { width, height } = this.player;
      const offset = (1 - view.animationAttr.scale) * 0.5;
      if (view.animationAttr.x === undefined) attr.x = width * offset;
      if (view.animationAttr.y === undefined) attr.y = height * offset;
      view.attr(attr);
    }
    return view;
  }

  updatezIndex() {
    for (const view of Object.values(this._views)) {
      view.sortDirty = true;
    }
  }

  createView() {
    const view = new pixiContainer();
    view.sortableChildren = true;
    return view;
  }
}

export default Container;