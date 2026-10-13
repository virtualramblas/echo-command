import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class MarineSnow {
  constructor(scene, count = 1500) {
    this.scene = scene;
    this.count = count;
    this.range = 60; // Field boundary box around camera

    const positions = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * this.range;
      positions[i + 1] = (Math.random() - 0.5) * this.range;
      positions[i + 2] = (Math.random() - 0.5) * this.range;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x39ff14,
      size: 0.15,
      transparent: true,
      opacity: 0.45
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  update(referencePosition) {
    const pos = this.points.geometry.attributes.position.array;
    const half = this.range / 2;

    for (let i = 0; i < this.count * 3; i += 3) {
      // Re-center around player reference
      let dx = pos[i] - referencePosition.x;
      let dy = pos[i + 1] - referencePosition.y;
      let dz = pos[i + 2] - referencePosition.z;

      if (dx > half) pos[i] -= this.range;
      if (dx < -half) pos[i] += this.range;
      if (dy > half) pos[i + 1] -= this.range;
      if (dy < -half) pos[i + 1] += this.range;
      if (dz > half) pos[i + 2] -= this.range;
      if (dz < -half) pos[i + 2] += this.range;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}