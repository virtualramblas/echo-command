import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RetroCRTShader } from './RetroCRTShader.js';

export class PostProcessingPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Initialize composer with high-precision render target
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    });

    this.composer = new EffectComposer(this.renderer, renderTarget);

    // 2. Base 3D Scene Pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 3. Unreal Bloom Pass (Phosphor Glow for neon vector lines)
    const resolution = new THREE.Vector2(width, height);
    this.bloomPass = new UnrealBloomPass(resolution, 1.25, 0.45, 0.2);
    this.composer.addPass(this.bloomPass);

    // 4. Custom CRT Scanline & Curvature Pass
    this.crtPass = new ShaderPass(RetroCRTShader);
    this.crtPass.renderToScreen = true;
    this.composer.addPass(this.crtPass);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  render(delta) {
    this.crtPass.uniforms.uTime.value += delta;
    this.composer.render();
  }
}