import { Filter } from "pixi.js";
import vert from '../shaders/trans.vert';
import fragTpl from '../shaders/trans.frag';

export default class TransitionFilter extends Filter {
  constructor(transition) {
    let { glsl, paramsTypes, defaultParams } = transition;
    const frag = fragTpl.replace('${transitionGlsl}', glsl);
    const uniforms = {
      progress: 0, fromSampler: null, toSampler: null, 
      ratio: 1, _offset: [0, 0], flipY: true,
    };
    for (let key in paramsTypes) {
      uniforms[key] = defaultParams[key] || null;
    }
    super(vert, frag, uniforms);
    this.transition = transition;
  }

  get prev() {
    return this.fromSprite;
  }

  get next() {
    return this.toSprite;
  }

  set prev(sprite) {
    this.setSprite('from', sprite);
  }

  set next(sprite) {
    this.setSprite('to', sprite);
  }

  get ratio() {
    return this.uniforms.ratio;
  }

  set ratio(ratio) {
    this.uniforms.ratio = ratio;
  }

  get offset() {
    return this.uniforms._offset;
  }

  set offset(offset) {
    this.uniforms._offset = offset;
  }

  set params(params) {
    let unit = 2;
    const { transition, uniforms } = this;
    for (let key in transition.paramsTypes) {
      const value = key in params
        ? params[key]
        : transition.defaultParams[key];
      if (transition.paramsTypes[key] === "sampler2D") {
        if (!value) {
          console.warn(
            "uniform[" +
              key +
              "]: A texture MUST be defined for uniform sampler2D of a texture"
          );
        } else if (typeof value.bind !== "function") {
          throw new Error(
            "uniform[" +
              key +
              "]: A gl-texture2d API-like object was expected"
          );
        } else {
          uniforms[key] = value.bind(unit++);
        }
      } else {
        uniforms[key] = value;
      }
    }
  }

  setFlip(flipY) {
    this.uniforms.flipY = flipY;
  }

  setSprite(key, sprite) {
    this[`${key}Sprite`] = sprite;
    sprite.renderable = false;
    this.uniforms[`${key}Sampler`] = sprite.texture;
  }

  updateProgress(progress) {
    this.uniforms.progress = progress;
  }
}
