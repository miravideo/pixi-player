attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 filterMatrix;

varying vec2 vTextureCoord;
varying vec2 vFilterCoord;
varying vec2 _uv;

void main(void) {
  vec2 _p = (projectionMatrix * vec3(aVertexPosition, 1.0)).xy;
  gl_Position = vec4(_p, 0.0, 1.0);
  vFilterCoord = ( filterMatrix * vec3( aTextureCoord, 1.0)  ).xy;
  vTextureCoord = aTextureCoord;
  _uv = vec2(0.5, 0.5) * (_p+vec2(1.0, 1.0));
}
