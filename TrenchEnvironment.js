import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class TrenchEnvironment {
  constructor(scene) {
    this.scene = scene;
    
    // Chunk generation settings
    this.segmentLength = 6.0;       // Length of each slice (Z-axis)
    this.totalSegments = 80;        // Number of active rings
    this.trenchRadius = 18.0;       // Base radius of trench cavern
    this.radialSegments = 16;       // Polygonal fidelity per ring
    
    this.trenchMesh = null;
    this.geometry = null;
    this.baseZ = 0;

    this.initTrench();
  }

  initTrench() {
    const vertexCount = (this.totalSegments + 1) * this.radialSegments;
    const positions = new Float32Array(vertexCount * 3);
    const indices = [];

    // Construct index array for cylindrical wireframe corridor
    for (let i = 0; i < this.totalSegments; i++) {
      for (let j = 0; j < this.radialSegments; j++) {
        const nextJ = (j + 1) % this.radialSegments;
        const current = i * this.radialSegments + j;
        const next = i * this.radialSegments + nextJ;
        const below = (i + 1) * this.radialSegments + j;
        const belowNext = (i + 1) * this.radialSegments + nextJ;

        // Quad triangles
        indices.push(current, below, next);
        indices.push(next, below, belowNext);
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Vector wireframe material
    const material = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });

    this.trenchMesh = new THREE.Mesh(this.geometry, material);
    this.scene.add(this.trenchMesh);

    // Initial vertex placement
    this.recomputePositions(0);
  }

  sampleTrenchPath(z) {
    // Winding center curve of the deep trench
    const centerX = Math.sin(z * 0.015) * 16.0 + Math.cos(z * 0.035) * 8.0;
    const centerY = Math.cos(z * 0.012) * 8.0 + Math.sin(z * 0.025) * 4.0;
    return { centerX, centerY };
  }

  recomputePositions(leadZ) {
    const pos = this.geometry.attributes.position.array;
    let ptr = 0;

    const startSeg = Math.floor(leadZ / this.segmentLength);
    this.baseZ = startSeg * this.segmentLength;

    for (let i = 0; i <= this.totalSegments; i++) {
      const currentZ = -(this.baseZ + i * this.segmentLength);
      const { centerX, centerY } = this.sampleTrenchPath(currentZ);

      // Radial perturbation for canyon roughness
      const noiseVariation = 1.0 + Math.sin(currentZ * 0.08) * 0.2 + Math.cos(currentZ * 0.15) * 0.15;
      const currentRadius = this.trenchRadius * noiseVariation;

      for (let j = 0; j < this.radialSegments; j++) {
        const theta = (j / this.radialSegments) * Math.PI * 2;
        // Make the trench narrower horizontally and taller vertically (canyon shape)
        const x = centerX + Math.cos(theta) * (currentRadius * 0.7);
        const y = centerY + Math.sin(theta) * (currentRadius * 1.3);

        pos[ptr++] = x;
        pos[ptr++] = y;
        pos[ptr++] = currentZ;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  update(playerZ) {
    // When submarine travels forward past one chunk interval, shift grid forward
    if (-playerZ > this.baseZ + this.segmentLength) {
      this.recomputePositions(-playerZ);
    }
  }

  checkCollision(position) {
    const { centerX, centerY } = this.sampleTrenchPath(position.z);
    const dx = position.x - centerX;
    const dy = position.y - centerY;

    // Elliptical canyon boundary distance
    const normX = dx / (this.trenchRadius * 0.7);
    const normY = dy / (this.trenchRadius * 1.3);
    const distSq = normX * normX + normY * normY;

    return {
      isColliding: distSq >= 0.85, // Approaching trench bedrock
      distanceRatio: Math.sqrt(distSq)
    };
  }
}