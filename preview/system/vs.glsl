const SPR_VS = `#version 300 es
precision highp float;
in vec2 aC; in vec3 aPos; in vec4 aFrame; in vec4 aInfo;
uniform vec3 uOrig, uFwd, uRight, uUp; uniform float uTanH, uAspect, uTime, uShadow;
out vec2 vUV; flat out vec4 vFrame; out float vDepth;
void main(){
  vec3 base = uOrig + aPos;                 // camera-relative position
  vUV = aC; vFrame = aFrame;
  float w = aInfo.x, h = aInfo.y, lift = aInfo.z;
  vec3 v;
  if (aInfo.w > 5.0) {
    // free-flying sprite: centre pivot, turned in the screen plane
    float a = aInfo.w - 10.0, ca = cos(a), sa = sin(a);
    vec2 c = vec2((aC.x-0.5)*w, (aC.y-0.5)*h);
    c = vec2(c.x*ca - c.y*sa, c.x*sa + c.y*ca);
    if (uShadow > 0.5) c = vec2(1e5);
    v = base + uRight*c.x + uUp*c.y;
  } else if (uShadow > 0.5) {
    vec3 sdir = normalize(uRight*0.55 - uUp*0.35 + uFwd*0.6);
    v = base + uRight*(aC.x-0.5)*w + sdir*aC.y*h*0.55;
  } else {
    v = base + uRight*(aC.x-0.5)*w + uUp*(aC.y*h + lift);
  }
  float x = dot(v,uRight), y = dot(v,uUp), z = dot(v,uFwd);
  vDepth = z;
  gl_Position = vec4(x/(uTanH*uAspect), y/uTanH, 0.0, z);
}`;
