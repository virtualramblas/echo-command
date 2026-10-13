export class CockpitHUD {
  constructor() {
    this.shieldStates = { bow: 100, stern: 100, port: 100, starboard: 100 };
    this.focusedQuadrant = 'bow';
    this.sonarActive = false;
    this.sonarAngle = 0;
    this.sonarBlips = [
      { dist: 0.65, angle: 0.8, alpha: 0.0 },
      { dist: 0.42, angle: 2.3, alpha: 0.0 }
    ];
    this.torpedoStatus = 'READY';
    this.silentRunning = false;
    this.decibelLevel = 42; // Base ambient submarine hum in dB

    this.initCanvasHUD();
  }

  initCanvasHUD() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'cockpit-canvas';
    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.ctx = this.canvas.getContext('2d');
  }

  // --- Tool Action Handlers (NeuDecide Direct Mappings) ---

  adjustShield(quadrant) {
    this.focusedQuadrant = quadrant.toLowerCase();
    // Rebalance shield quadrant power
    for (let k of ['bow', 'stern', 'port', 'starboard']) {
      this.shieldStates[k] = (k === this.focusedQuadrant) ? 100 : 45;
    }
  }

  triggerSonarPing() {
    this.sonarActive = true;
    // Reveal contacts on ping
    for (let b of this.sonarBlips) {
      b.alpha = 1.0;
    }
    setTimeout(() => {
      this.sonarActive = false;
    }, 4500);
  }

  fireTorpedo() {
    if (this.torpedoStatus !== 'READY') return false;
    this.torpedoStatus = 'LAUNCHING';
    setTimeout(() => { this.torpedoStatus = 'RELOADING'; }, 1200);
    setTimeout(() => { this.torpedoStatus = 'READY'; }, 5500);
    return true;
  }

  toggleSilentRunning(enable) {
    this.silentRunning = (enable !== undefined) ? enable : !this.silentRunning;
    this.decibelLevel = this.silentRunning ? 18 : 42;
  }

  // --- Render Loop for Cockpit Graphics ---

  draw(telemetry, delta) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Color Palette
    const neonGreen = '#39ff14';
    const dimGreen = 'rgba(57, 255, 20, 0.25)';
    const alertCyan = '#00f0ff';
    const warningRed = '#ff3333';

    ctx.strokeStyle = neonGreen;
    ctx.fillStyle = neonGreen;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.lineWidth = 2;

    // 1. Draw Sonar Scope (Bottom-Left)
    this.drawSonar(ctx, 160, h - 160, 110, delta);

    // 2. Draw Shield Array (Bottom-Right)
    this.drawShields(ctx, w - 160, h - 160, 100);

    // 3. Draw Pitch Ladder / Gyro Horizon (Center)
    this.drawPitchLadder(ctx, w / 2, h / 2, telemetry);

    // 4. Draw Ordnance Status & Silent Running (Bottom Center)
    this.drawTacticalStatus(ctx, w / 2, h - 80);

    // 5. Draw Decibel Acoustic Meter (Top-Right)
    this.drawAcousticMeter(ctx, w - 240, 60);
  }

  drawSonar(ctx, cx, cy, radius, delta) {
    // Outer Scope Rings
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius * 0.33, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.3)';
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Sweeping Radar Hand
    this.sonarAngle = (this.sonarAngle + delta * (this.sonarActive ? 3.5 : 1.2)) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(this.sonarAngle) * radius, cy + Math.sin(this.sonarAngle) * radius);
    ctx.strokeStyle = this.sonarActive ? '#00f0ff' : '#39ff14';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Radar Blips
    for (let b of this.sonarBlips) {
      if (b.alpha > 0.01) {
        b.alpha = Math.max(0, b.alpha - delta * 0.25);
        const bx = cx + Math.cos(b.angle) * (radius * b.dist);
        const by = cy + Math.sin(b.angle) * (radius * b.dist);

        ctx.fillStyle = `rgba(255, 51, 51, ${b.alpha})`;
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();

        // Contact label
        ctx.fillStyle = `rgba(255, 51, 51, ${b.alpha * 0.8})`;
        ctx.fillText('TRGT-01', bx + 8, by - 4);
      }
    }

    // Title
    ctx.fillStyle = '#39ff14';
    ctx.fillText('SONAR SCANNER', cx - 55, cy + radius + 25);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(this.sonarActive ? 'STATUS: ACTIVE PING' : 'STATUS: PASSIVE', cx - 65, cy + radius + 42);
  }

  drawShields(ctx, cx, cy, radius) {
    const quadrants = [
      { name: 'bow', angleStart: -Math.PI * 0.75, angleEnd: -Math.PI * 0.25, label: 'BOW' },
      { name: 'starboard', angleStart: -Math.PI * 0.25, angleEnd: Math.PI * 0.25, label: 'STBD' },
      { name: 'stern', angleStart: Math.PI * 0.25, angleEnd: Math.PI * 0.75, label: 'STERN' },
      { name: 'port', angleStart: Math.PI * 0.75, angleEnd: Math.PI * 1.25, label: 'PORT' }
    ];

    // Submarine silhouette icon at center
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 38, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(57, 255, 20, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shield Arcs
    for (let q of quadrants) {
      const isFocused = this.focusedQuadrant === q.name;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.75, q.angleStart + 0.12, q.angleEnd - 0.12);
      ctx.strokeStyle = isFocused ? '#00f0ff' : 'rgba(57, 255, 20, 0.4)';
      ctx.lineWidth = isFocused ? 5 : 2;
      ctx.stroke();

      // Quadrant labels
      const midAngle = (q.angleStart + q.angleEnd) / 2;
      const lx = cx + Math.cos(midAngle) * (radius * 0.95);
      const ly = cy + Math.sin(midAngle) * (radius * 0.95);
      ctx.fillStyle = isFocused ? '#00f0ff' : 'rgba(57, 255, 20, 0.6)';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText(`${q.label} ${this.shieldStates[q.name]}%`, lx - 24, ly + 4);
    }

    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.fillText('SHIELD ARRAY', cx - 52, cy + radius + 25);
  }

  drawPitchLadder(ctx, cx, cy, telemetry) {
    ctx.save();
    ctx.translate(cx, cy);

    // Rotate ladder by submarine roll
    const rollRad = (telemetry.roll || 0);
    ctx.rotate(-rollRad);

    const pitchOffset = (telemetry.pitch || 0) * 80;

    ctx.strokeStyle = 'rgba(57, 255, 20, 0.45)';
    ctx.lineWidth = 1.5;

    // Pitch rungs
    for (let deg of [-20, -10, 0, 10, 20]) {
      const y = pitchOffset - deg * 3.5;
      if (Math.abs(y) > 120) continue;

      const rungWidth = deg === 0 ? 90 : 50;
      ctx.beginPath();
      ctx.moveTo(-rungWidth, y);
      ctx.lineTo(-15, y);
      ctx.moveTo(15, y);
      ctx.lineTo(rungWidth, y);
      ctx.stroke();

      // Draw tick marks
      ctx.beginPath();
      ctx.moveTo(-rungWidth, y);
      ctx.lineTo(-rungWidth, y + (deg >= 0 ? 5 : -5));
      ctx.moveTo(rungWidth, y);
      ctx.lineTo(rungWidth, y + (deg >= 0 ? 5 : -5));
      ctx.stroke();

      if (deg !== 0) {
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = 'rgba(57, 255, 20, 0.5)';
        ctx.fillText(String(Math.abs(deg)), rungWidth + 6, y + 3);
      }
    }

    // Fixed center aircraft/sub reticle
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(-20, 0); ctx.lineTo(-8, 0);
    ctx.moveTo(8, 0); ctx.lineTo(20, 0);
    ctx.moveTo(0, -20); ctx.lineTo(0, -8);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  drawTacticalStatus(ctx, cx, cy) {
    // Torpedo Status Box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(cx - 220, cy - 25, 200, 50);
    ctx.strokeStyle = (this.torpedoStatus === 'READY') ? '#39ff14' : '#ff3333';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 220, cy - 25, 200, 50);

    ctx.fillStyle = (this.torpedoStatus === 'READY') ? '#39ff14' : '#ff3333';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('TORPEDO TUBE 01', cx - 205, cy - 8);
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(this.torpedoStatus, cx - 205, cy + 14);

    // Silent Running Box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(cx + 20, cy - 25, 200, 50);
    ctx.strokeStyle = this.silentRunning ? '#00f0ff' : '#39ff14';
    ctx.strokeRect(cx + 20, cy - 25, 200, 50);

    ctx.fillStyle = this.silentRunning ? '#00f0ff' : '#39ff14';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('ACOUSTIC PROFILE', cx + 35, cy - 8);
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(this.silentRunning ? 'SILENT RUNNING' : 'STANDARD (ACTIVE)', cx + 35, cy + 14);
  }

  drawAcousticMeter(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx, cy, 210, 48);
    ctx.strokeStyle = '#39ff14';
    ctx.strokeRect(cx, cy, 210, 48);

    ctx.fillStyle = '#8fa0ba';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText(`EMITTED NOISE: ${this.decibelLevel} dB`, cx + 10, cy + 18);

    // Audio bar visualizer
    const maxBars = 18;
    const activeBars = Math.round((this.decibelLevel / 60) * maxBars);
    for (let i = 0; i < maxBars; i++) {
      ctx.fillStyle = (i < activeBars) ? (i > 14 ? '#ff3333' : '#39ff14') : 'rgba(57, 255, 20, 0.15)';
      ctx.fillRect(cx + 10 + i * 10, cy + 26, 7, 14);
    }
  }
}