import { Filter } from "pixi.js";
import vert from '../shaders/default.vert';
import frag from '../shaders/chroma.frag';

export default class ChromaFilter extends Filter {
  constructor({rgbColor, similarity=0.2, smoothness=0.1, saturation=0.1, shadowness=0.1}) {
    const uniforms = {
      uColor: [0, 1, 0, 1],
      uSimilarity: 0.3, uSmoothness: 0.1, uSaturation: 0.1, uShadowness: 0.5,
    };
    super(vert, frag, uniforms);

    this.color = rgbColor;
    this.similarity = Math.max(similarity, 0.001);
    this.smoothness = Math.max(smoothness, 0.001);
    this.saturation = Math.max(saturation, 0.001);
    this.shadowness = Math.max(shadowness, 0.001);
  }

  get color() {
    return this.uniforms.uColor;
  }

  set color(value) {
    this.uniforms.uColor = value.map(x => x / 255);
  }

  get similarity() {
    return this.uniforms.uSimilarity;
  }

  set similarity(value) {
    this.uniforms.uSimilarity = value;
  }

  get smoothness() {
    return this.uniforms.uSmoothness;
  }

  set smoothness(value) {
    this.uniforms.uSmoothness = value;
  }

  get saturation() {
    return this.uniforms.uSaturation;
  }

  set saturation(value) {
    this.uniforms.uSaturation = value;
  }

  get shadowness() {
    return this.uniforms.uShadowness;
  }

  set shadowness(value) {
    this.uniforms.uShadowness = value;
  }
  
}
