'use strict';

/**
 * ShaderManager - A video transition shader manager (post-processing).
 *
 * ####Example:
 *
 *     const source = ShaderManager.getShaderByName(name);
 *
 *
 * ####Note:
 *     - Commonly used glsl function remarks
 *     clamp(x,a,b) - [a,b]
 *     fract(x) - 2.12312->0.12312
 *     mix(a,b,x) - x(1-a)+y*a
 *     step(a,x) - x<a =0 x>a =1
 *     // https://thebookofshaders.com/glossary/?search=smoothstep
 *     smoothstep(a,b,x) - x<a =0 x>b =1 [a,b] =3x^2-2x^3
 *     vec2 uv = fragCoord.xy/iResolution.xy [0-1] - transition(vec2 p)
 *
 * @object
 */

const transitions = require('gl-transitions');

const Cube = require('../shaders/transitions/cube');
const Fat = require('../shaders/transitions/fat');
const Lens = require('../shaders/transitions/lens');
const Slice = require('../shaders/transitions/slice');
const Shake = require('../shaders/transitions/shake');
const Stretch = require('../shaders/transitions/stretch');
const BackOff = require('../shaders/transitions/backoff');
const Fluidly = require('../shaders/transitions/fluidly');
const Oblique = require('../shaders/transitions/oblique');
const Windows4 = require('../shaders/transitions/windows4');
const Tetrapod = require('../shaders/transitions/tetrapod');
const Colorful = require('../shaders/transitions/colorful');
const MoveLeft = require('../shaders/transitions/moveleft');
const Sunflower = require('../shaders/transitions/sunflower');
const ZoomRight = require('../shaders/transitions/zoomright');
const WaterWave = require('../shaders/transitions/waterwave');
const Radiation = require('../shaders/transitions/radiation');
const Quicksand = require('../shaders/transitions/quicksand');
const Magnifier = require('../shaders/transitions/magnifier');
const FastSwitch = require('../shaders/transitions/fastswitch');
const HangAround = require('../shaders/transitions/hangaround');
const CircleCrop = require('../shaders/transitions/circlecrop');
const WindowShades = require('../shaders/transitions/windowshades');
const TricolorCircle = require('../shaders/transitions/tricolorcircle');

const extraTransitions = [
  Cube,
  Fat,
  Lens,
  Shake,
  Slice,
  Stretch,
  Fluidly,
  BackOff,
  Oblique,
  MoveLeft,
  Windows4,
  Colorful,
  Magnifier,
  Tetrapod,
  Sunflower,
  ZoomRight,
  Radiation,
  WaterWave,
  HangAround,
  FastSwitch,
  WindowShades,
  CircleCrop,
  TricolorCircle,
  Quicksand,
];

/**
 * ShaderManager
 */
const ShaderManager = {
  /**
   * Get the shader source code by name
   * @param {string} name - shader name
   * @return {string} shader source
   * @public
   */
  getShaderByName(name) {
    // console.log('extraTransitions', extraTransitions.map(x => {
    //   return {n:x.name, ...x.paramsTypes}
    // }));
    // console.log('transitions', transitions.map(x => {
    //   return {n:x.name, ...x.paramsTypes}
    // }));
    if (!name) return;
    let shader = this.getFromArr(name, extraTransitions);
    if (!shader) shader = this.getFromArr(name, transitions);
    if (!shader && name.toLowerCase() == 'random') shader = this.getRandomShader();
    if (!shader) shader = this.getFromArr('fade', transitions);
    return shader;
  },

  getFromArr(name, arr) {
    let shader;
    arr.map(trans => {
      if (trans.name.toLowerCase() == name.toLowerCase()) shader = trans;
    });
    return shader;
  },

  getRandomShader() {
    return transitions[Math.floor(Math.random()*items.length)];
  },
};

module.exports = ShaderManager;
