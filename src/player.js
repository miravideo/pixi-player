import React from "react";
import ReactDOM from "react-dom";
import { App } from "./app/index";
import Store from "./app/store";
import Utils from "./app/utils";

const VERSION = '$VERSION';

class PlayerUI {
  constructor(container, options) {
    this.version = VERSION;
    this.container = container;
    this.load(options);

    // observe resize
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.resizing) return;
      this.resizing = true;
      requestAnimationFrame(() => {
        const { width, height } = Utils.innerSize(container);
        if (!this.store) return;
        if (width !== this.width || height !== this.height) {
          this.resize(width, height);
        }
        this.resizing = false;
      });
    });
    this.resizeObserver.observe(container);
  }

  load(options) {
    if (this.store) {
      try {
        this.store.destroy();
      } catch (e) {}
      ReactDOM.unmountComponentAtNode(this.container);
    }

    const { width, height } = Utils.innerSize(this.container);
    options = {width, height, ...(options || {})};
    this.store = new Store(options);
    ReactDOM.render(<App store={this.store}/>, this.container);
    this.store.load();
  }

  get core() {
    return this.store.player;
  }

  resize(width, height) {
    this.store.resize(width, height);
  }

  get width() {
    return this.store.width;
  }

  get height() {
    return this.store.height;
  }

  on(event, callback) {
    this.store.player.on(event, callback);
  }

  off(event, callback) {
    this.store.player.off(event, callback);
  }

  once(event, callback) {
    this.store.player.once(event, callback);
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = null;
    if (this.store) this.store.destroy();
    this.store = null;
    if (this.container) this.container.innerHTML = '';
    this.container = null;
  }
}

const PixiPlayer = global['pixi-player'];
if (!PixiPlayer['init']) {
  PixiPlayer['init'] = (container, options) => {
    return new PlayerUI(container, options);
  }
}
PixiPlayer['version'] = VERSION;

export default PixiPlayer
