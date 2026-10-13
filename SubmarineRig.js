import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class SubmarineRig {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Root container representing the submarine center of mass
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);
    this.scene.add(this.mesh);

    // Dynamic Physics Properties
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3(); // x: pitch, y: yaw, z: roll

    // Tuning Coefficients
    this.maxSpeed = 28.0;          // Maximum forward velocity in m/s (approx 54 knots)
    this.engineThrust = 32.0;      // Forward acceleration power
    this.reverseThrust = 16.0;     // Reverse propulsion power
    this.linearDrag = 0.85;        // Fluid resistance dampening per second
    this.angularDrag = 3.5;       // Rotational resistance dampening per second
    this.turnRate = 1.2;           // Steering agility (rad/s^2)
    this.diveRate = 0.9;           // Elevation/pitch agility
    this.rollStabilization = 1.8;  // Tendency to return to horizontal roll level

    // State Variables
    this.throttle = 0.0;           // Current target throttle [-0.5 to 1.0]
    this.depth = 420.0;            // Simulated depth in meters
    this.rudderInput = 0.0;        // Yaw steering [-1 to 1]
    this.diveInput = 0.0;          // Pitch dive plane steering [-1 to 1]
    this.rollInput = 0.0;          // Manual banking [-1 to 1]

    // Visual placeholder for sub body
    this.createCockpitMarker();
  }

  createCockpitMarker() {
    // Subtle vector wireframe marker representing the player hull in chase mode
    const hullGeo = new THREE.ConeGeometry(0.8, 3.5, 4);
    hullGeo.rotateX(Math.PI / 2);
    const hullMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    this.hullMesh = new THREE.Mesh(hullGeo, hullMat);
    this.mesh.add(this.hullMesh);
  }

  setInputs({ forward = 0, rudder = 0, dive = 0, roll = 0 }) {
    this.throttle = THREE.MathUtils.clamp(forward, -0.5, 1.0);
    this.rudderInput = THREE.MathUtils.clamp(rudder, -1.0, 1.0);
    this.diveInput = THREE.MathUtils.clamp(dive, -1.0, 1.0);
    this.rollInput = THREE.MathUtils.clamp(roll, -1.0, 1.0);
  }

  update(delta) {
    if (delta > 0.1) delta = 0.1; // Clamp step for stability

    // 1. Angular Propulsion & Damping
    const targetPitchTorque = this.diveInput * this.diveRate;
    const targetYawTorque = -this.rudderInput * this.turnRate;
    let targetRollTorque = -this.rollInput * this.turnRate;

    // Automatic bank banking when turning yaw
    targetRollTorque += this.rudderInput * 0.4;

    // Auto-level roll when no roll input is given
    const currentEuler = new THREE.Euler().setFromQuaternion(this.mesh.quaternion, 'YXZ');
    targetRollTorque += -currentEuler.z * this.rollStabilization;

    // Integrate Angular Accelerations
    this.angularVelocity.x += targetPitchTorque * delta;
    this.angularVelocity.y += targetYawTorque * delta;
    this.angularVelocity.z += targetRollTorque * delta;

    // Apply Angular Fluid Drag
    this.angularVelocity.x -= this.angularVelocity.x * this.angularDrag * delta;
    this.angularVelocity.y -= this.angularVelocity.y * this.angularDrag * delta;
    this.angularVelocity.z -= this.angularVelocity.z * this.angularDrag * delta;

    // Rotate Ship
    this.mesh.rotateX(this.angularVelocity.x * delta);
    this.mesh.rotateY(this.angularVelocity.y * delta);
    this.mesh.rotateZ(this.angularVelocity.z * delta);

    // 2. Linear Thrust & Hydrodynamic Drag
    const forwardDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    const appliedThrust = (this.throttle >= 0 ? this.throttle * this.engineThrust : this.throttle * this.reverseThrust);

    // Forward Acceleration
    this.acceleration.copy(forwardDirection).multiplyScalar(appliedThrust);

    // Apply Linear Fluid Drag: -v * drag * dt
    const dragForce = this.velocity.clone().multiplyScalar(-this.linearDrag);
    this.acceleration.add(dragForce);

    // Integrate Linear Velocity & Position
    this.velocity.addScaledVector(this.acceleration, delta);
    this.mesh.position.addScaledVector(this.velocity, delta);

    // Telemetry updates
    this.depth += -this.velocity.y * delta;
    if (this.depth < 10) this.depth = 10;

    // 3. Update Camera Placement (Third-Person Tactical Follow)
    this.updateCamera(delta);
  }

  updateCamera(delta) {
    // Offset behind and slightly above the sub
    const camOffset = new THREE.Vector3(0, 1.4, 4.2).applyQuaternion(this.mesh.quaternion);
    const targetCamPos = this.mesh.position.clone().add(camOffset);

    // Smooth camera lag
    this.camera.position.lerp(targetCamPos, 8.0 * delta);

    // Look slightly ahead of submarine bow
    const lookTarget = this.mesh.position.clone().add(
      new THREE.Vector3(0, 0.4, -6.0).applyQuaternion(this.mesh.quaternion)
    );
    this.camera.lookAt(lookTarget);
  }

  getTelemetry() {
    const knots = Math.round(this.velocity.length() * 1.94384);
    const euler = new THREE.Euler().setFromQuaternion(this.mesh.quaternion, 'YXZ');
    let heading = Math.round(THREE.MathUtils.radToDeg(-euler.y)) % 360;
    if (heading < 0) heading += 360;

    return {
      speedKnots: knots,
      depthMeters: Math.round(this.depth),
      headingDeg: heading,
      position: this.mesh.position
    };
  }
}