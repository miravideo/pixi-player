precision highp float; // 高精度还是需要的，否则一些random的计算可能不够

varying vec2 vTextureCoord;
varying vec2 vFilterCoord; // for mask
varying vec2 _uv;

uniform float ratio;
uniform vec2 _offset;

uniform sampler2D fromSampler;
uniform sampler2D toSampler;

uniform sampler2D uSampler;
uniform float progress;
uniform bool flipY;

vec4 getColor(sampler2D tex, vec2 uv) {
  vec2 coord = uv + _offset;
  if (flipY) {
    coord.y = 1.0 - coord.y;
  }
  return texture2D(tex, coord);
}

vec4 getFromColor(vec2 uv) {
  return getColor(fromSampler, uv);
}

vec4 getToColor(vec2 uv) {
  return getColor(toSampler, uv);
}

${transitionGlsl}

void main(void) {
  gl_FragColor = transition(_uv);
}
