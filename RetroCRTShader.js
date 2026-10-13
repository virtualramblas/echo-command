import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const RetroCRTShader = {
  name: 'RetroCRTShader',

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uCurvature: { value: 5.2 },          // Barrel distortion (higher = flatter screen, less edge clipping)
    uScanlineIntensity: { value: 0.22 }, // Intensity of horizontal scanlines [0.0 - 1.0]
    uScanlineCount: { value: 680.0 },    // Scanline frequency across viewport height
    uRgbShift: { value: 0.0020 },        // Chromatic aberration separation magnitude
    uVignetteDarkness: { value: 10.0 },  // Vignette edge shading multiplier
    uFlickerIntensity: { value: 0.012 }  // CRT refresh flicker amplitude
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
    uniform float uVignetteDarkness;
    uniform float uFlickerIntensity;

    varying vec2 vUv;

    // Spherical barrel distortion mapping calibrated for rectangular viewports
    vec2 curveUV(vec2 uv) {
      vec2 st = uv * 2.0 - 1.0;
      vec2 offset = abs(st.yx) / vec2(uCurvature, uCurvature);
      st = st + st * offset * offset;
      return st * 0.5 + 0.5;
    }

    void main() {
      // 1. Calculate distorted screen UV coordinates
      vec2 uv = curveUV(vUv);

      // 2. Discard and render deep bezel black if outside tube bounds
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.005, 0.01, 0.02, 1.0);
        return;
      }

      // 3. Chromatic Aberration (Phosphor RGB beam misalignment)
      vec2 rOffset = vec2(uRgbShift, 0.0);
      vec2 bOffset = vec2(-uRgbShift, 0.0);

      float r = texture2D(tDiffuse, uv + rOffset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + bOffset).b;
      vec3 color = vec3(r, g, b);

      // 4. Horizontal CRT Scanline Raster
      float scanline = sin(uv.y * uScanlineCount * 3.14159265);
      scanline = (scanline + 1.0) * 0.5;
      color -= color * scanline * uScanlineIntensity;

      // 5. Cathode Ray Tube Refresh Flicker
      float flicker = sin(uTime * 110.0) * cos(uTime * 45.0) * uFlickerIntensity;
      color += color * flicker;

      // 6. Vignette Corner Falloff
      vec2 vigCoords = uv * (1.0 - uv.yx);
      float vig = vigCoords.x * vigCoords.y * uVignetteDarkness;
      vig = clamp(pow(vig, 0.28), 0.0, 1.0);
      color *= vig;

      gl_FragColor = vec4(color, 1.0);
    }
  `
};