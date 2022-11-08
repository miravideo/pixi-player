import { Filter, TextureMatrix, Matrix } from "pixi.js";
import DEFAULT_VERT from '../shaders/default-filter-matrix.vert';
import DEFAULT_FRAG from '../shaders/filter.frag';

const DEFAULT_VARS = {
  uStart: 0, uDuration: 1, 
  uMask: null, maskClamp: [0, 0, 1, 1],
  useMask: false, useBinaryMask: false, useReverseMask: false,
  uMaskAnchor: [0, 0], uMaskSize: [0, 0], uMaskRotation: 0.0, 
  uFrameSize: [0, 0], filterMatrix: new Matrix(),
};

export default class SimpleFilter extends Filter {
  constructor(opt) {
    let { key, vert, frag, render, vars } = opt || {};

    if (!render) {
      render = `
        vec4 render(sampler2D tex, vec2 uv, inout vec4 bg, vec4 mask, float alpha) {
          return bg;
        }
      `;
    }

    if (!vert) vert = DEFAULT_VERT;
    if (!frag) {
      const uniforms = [];
      if (vars) {
        for (const [key, val] of Object.entries(vars)) {
          if (!key) continue;
          const type = Array.isArray(val) ? `vec${val.length}` : 'float';
          uniforms.push(`uniform ${type} ${key};`);
        }
      }
      frag = DEFAULT_FRAG
        .replace('${uniforms}', uniforms.join("\n"))
        .replace('${render}', render);
    }

    super(vert, frag, {...vars, ...DEFAULT_VARS});
    if (key) this.glShaderKey = key;
    this._maskMatrix = new Matrix();
  }

  apply(filterManager, input, output, clearMode, _currentState) {
    if (this.uniforms.uFrameSize) {
      this.uniforms.uFrameSize[0] = input.filterFrame.width;
      this.uniforms.uFrameSize[1] = input.filterFrame.height;
    }
    if (this.uniforms.filterMatrix !== undefined && this._mask) {
      this.uniforms.filterMatrix = filterManager.calculateSpriteMatrix(
        this._maskMatrix, this._mask
      );
    }
    if (this._mask) {
      this.uniforms.uMaskAnchor = [this._mask.x, this._mask.y];
      this.uniforms.uMaskSize = [this._mask.width, this._mask.height];
      this.uniforms.uMaskRotation = this._mask.rotation;
      this.uniforms.useBinaryMask = !!this._mask.binaryMask;
      this.uniforms.useReverseMask = !!this._mask.reverseMask;
    }
    super.apply(filterManager, input, output, clearMode, _currentState);
  }

  get mask() {
    return this._mask;
  }

  set mask(mask) {
    this._mask = mask;
    if (mask) {
      const tex = mask.texture;
      if (!tex.transform) {
        // margin = 0.0, let it bleed a bit, shader code becomes easier
        // assuming that atlas textures were made with 1-pixel padding
        tex.transform = new TextureMatrix(tex, 0.0);
      }
      tex.transform.update();
      this.uniforms.uMask = tex;
      this.uniforms.useMask = true;
      this.uniforms.maskClamp = tex.transform.uClampFrame;
      mask.renderable = false;
      mask.isMask = true;
    } else {
      this.uniforms.useMask = false;
    }
  }

  setTime(start, duration) {
    this.uniforms.uStart = start;
    this.uniforms.uDuration = duration;
  }
}
