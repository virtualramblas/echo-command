import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const RetroCRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uCurvature: { value: 3.2 },           // Barrel distortion power (lower = more curve)
    uScanlineIntensity: { value: 0.28 },  // Scanline dark banding strength
    uScanlineCount: { value: 720.0 },     // Number of horizontal scanlines
    uRgbShift: { value: 0.0022 },         // Chromatic aberration separation
    uVignetteRoundness: { value: 1.8 },   // Corner falloff shape
    uVignetteDarkness: { value: 14.0 },   // Edge darkening
    uFlickerIntensity: { value: 0.015 }   // Subtle CRT refresh flicker
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uCurvature;
    uniform float uScanlineIntensity;
    uniform float uScanlineCount;
    uniform float uRgbShift;
    uniform float uVignetteRoundness;
    uniform float uVignetteDarkness;
    uniform float uFlickerIntensity;

    varying vec2 vUv;

    // Spherical barrel distortion mapping
    vec2 curveUV(vec2 uv) {
      vec2 st = uv * 2.0 - 1.0;
      vec2 offset = abs(st.yx) / vec2(uCurvature, uCurvature);
      st = st + st * offset * offset;
      return st * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = curveUV(vUv);

      // Clamp edges outside screen glass to pure black
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // Chromatic Aberration (RGB sub-pixel split)
      vec2 dir = uv - vec2(0.5);
      float r = texture2D(tDiffuse, uv + dir * uRgbShift).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * uRgbShift).b;
      vec3 color = vec3(r, g, b);

      // Horizontal Scanlines
      float scanline = sin(uv.y * uScanlineCount * 3.14159265);
      scanline = (scanline + 1.0) * 0.5;
      color -= scanline * uScanlineIntensity * color;

      // Subtle Phosphor Vertical Lines (Trinitron grille effect)
      float grille = mod(gl_FragCoord.x, 3.0);
      if (grille < 1.0) {
        color.r *= 1.06;
      } else if (grille < 2.0) {
        color.g *= 1.06;
      } else {
        color.b *= 1.06;
      }

      // CRT Refresh Flicker
      float flicker = sin(uTime * 110.0) * uFlickerIntensity;
      color += flicker;

      // Vignette Corner Shadowing
      vec2 v = uv * (1.0 - uv.yx);
      float vig = v.x * v.y * uVignetteDarkness;
      vig = clamp(pow(vig, 0.25), 0.0, 1.0);
      color *= vig;

      // Green phosphor CRT color tint enhancement
      color = mix(color, color * vec3(0.92, 1.08, 0.94), 0.35);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};