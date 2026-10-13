/**
 * CockpitHUD.js
 * High-performance 2D vector HUD rendered to an offscreen canvas
 * Designed for blitting onto the viewport overlay in cockpit-sim.html
 */
export class CockpitHUD {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');

    // Tactical State Variables
    this.sonarActive = false;
    this.sonarTimer = 0.0;
    this.sonarRadius = 0.0;
    this.radarAngle = 0.0;

    this.focusedQuadrant = 'all'; // 'bow', 'stern', 'port', 'starboard', 'all'
    this.shieldFocusTimer = 0.0;

    this.torpedoState = 'ARMED';   // 'ARMED', 'LAUNCHING', 'RELOADING'
    this.reloadProgress = 1.0;

    this.silentRunning = false;
    this.acousticDb = 38.0;

    // Contact Blips for Sonar (Normalized polar coords: dist [0-1], angle [rad])
    this.contacts = [
      { dist: 0.65, angle: 0.85, alpha: 0.0 },
      { dist: 0.42, angle: 2.30, alpha: 0.0 },
      { dist: 0.78, angle: 4.10, alpha: 0.0 }
    ];

    // Styling Palette
    this.colors = {
      neonGreen: '#39ff14',
      dimGreen: 'rgba(57, 255, 20, 0.25)',
      alertCyan: '#00f0ff',
      dimCyan: 'rgba(0, 240, 255, 0.2)',
      warningRed: '#ff3344',
      bgDark: 'rgba(7, 11, 18, 0.45)'
    };
  }

  // --- External Tactical Event Handlers ---

  triggerSonarPing() {
    this.sonarActive = true;
    this.sonarTimer = 0.0;
    this.sonarRadius = 0.0;
  }

  adjustShield(quadrant) {
    this.focusedQuadrant = quadrant.toLowerCase();
    this.shieldFocusTimer = 3.5; // Glow duration in seconds
  }

  fireTorpedo() {
    if (this.torpedoState !== 'ARMED') return;
    this.torpedoState = 'LAUNCHING';
    this.reloadProgress = 0.0;

    setTimeout(() => {
      this.torpedoState = 'RELOADING';
    }, 1200);
  }

  toggleSilentRunning() {
    this.silentRunning = !this.silentRunning;
  }

  // --- Main Render Loop ---

  draw(telemetry = {}, delta = 0.016) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Clear Frame
    ctx.clearRect(0, 0, w, h);

    // 2. Advance Internal Timers
    this.updateTimers(delta);

    // 3. Render Tactical Panels
    this.drawCrosshairAndPitch(ctx, w / 2, h / 2, telemetry);
    this.drawSonarScope(ctx, 220, h - 220, 150);
    this.drawShieldQuadrantArray(ctx, w - 220, h - 220, 110);
    this.drawAcousticMeter(ctx, 100, 140, telemetry);
    this.drawWeaponBay(ctx, w - 340, 140);
    this.drawTelemetryReadout(ctx, w / 2, 70, telemetry);
  }

  updateTimers(delta) {
    // Sonar sweep rotation
    this.radarAngle += delta * 1.8;
    if (this.radarAngle > Math.PI * 2) this.radarAngle -= Math.PI * 2;

    // Active sonar ping wave expansion
    if (this.sonarActive) {
      this.sonarTimer += delta;
      this.sonarRadius += delta * 90; // Pulse speed
      if (this.sonarTimer > 3.0) {
        this.sonarActive = false;
      }
    }

    // Shield highlight decay
    if (this.shieldFocusTimer > 0) {
      this.shieldFocusTimer = Math.max(0, this.shieldFocusTimer - delta);
      if (this.shieldFocusTimer === 0) {
        this.focusedQuadrant = 'all';
      }
    }

    // Torpedo reloading cycle
    if (this.torpedoState === 'RELOADING') {
      this.reloadProgress = Math.min(1.0, this.reloadProgress + delta * 0.22);
      if (this.reloadProgress >= 1.0) {
        this.torpedoState = 'ARMED';
      }
    }

    // Acoustic noise simulation
    const targetDb = this.silentRunning ? 14.0 : 42.0;
    this.acousticDb += (targetDb - this.acousticDb) * delta * 2.0;
  }

  // --- Sub-panel Renderers ---

  drawCrosshairAndPitch(ctx, cx, cy, telemetry) {
    ctx.save();
    ctx.strokeStyle = this.colors.neonGreen;
    ctx.lineWidth = 1.5;

    // Center reticle
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 14);
    ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + 30);
    ctx.stroke();

    // Artificial horizon pitch rungs
    const pitch = (telemetry.pitch || 0) * 120;
    const roll = telemetry.roll || 0;

    ctx.translate(cx, cy);
    ctx.rotate(roll);

    ctx.strokeStyle = this.colors.dimGreen;
    for (let r = -2; r <= 2; r++) {
      if (r === 0) continue;
      const yOffset = r * 35 - pitch;
      const width = Math.abs(r) === 1 ? 50 : 30;

      ctx.beginPath();
      ctx.moveTo(-width, yOffset);
      ctx.lineTo(width, yOffset);
      ctx.stroke();

      ctx.fillStyle = this.colors.neonGreen;
      ctx.font = '10px monospace';
      ctx.fillText(`${r * 10}°`, width + 8, yOffset + 3);
    }
    ctx.restore();
  }

  drawSonarScope(ctx, cx, cy, radius) {
    ctx.save();

    // Backdrop
    ctx.fillStyle = this.colors.bgDark;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Concentric range rings
    ctx.strokeStyle = this.colors.dimGreen;
    ctx.lineWidth = 1;
    [0.33, 0.66, 1.0].forEach(factor => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * factor, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Cross hairs
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Rotating sweep line
    const sweepX = cx + Math.cos(this.radarAngle) * radius;
    const sweepY = cy + Math.sin(this.radarAngle) * radius;
    ctx.strokeStyle = this.colors.neonGreen;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sweepX, sweepY);
    ctx.stroke();

    // Active expanding sonar pulse wave
    if (this.sonarActive && this.sonarRadius < radius) {
      const alpha = Math.max(0, 1 - this.sonarRadius / radius);
      ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, this.sonarRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Contact blips
    this.contacts.forEach(c => {
      const angleDiff = Math.abs((this.radarAngle - c.angle + Math.PI * 2) % (Math.PI * 2));
      if (angleDiff < 0.25 || (this.sonarActive && this.sonarRadius >= c.dist * radius)) {
        c.alpha = 1.0;
      } else {
        c.alpha = Math.max(0, c.alpha - 0.015);
      }

      if (c.alpha > 0.05) {
        const bx = cx + Math.cos(c.angle) * (c.dist * radius);
        const by = cy + Math.sin(c.angle) * (c.dist * radius);
        ctx.fillStyle = `rgba(255, 51, 68, ${c.alpha})`;
        ctx.shadowColor = '#ff3344';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Header label
    ctx.fillStyle = this.colors.neonGreen;
    ctx.font = '12px monospace';
    ctx.fillText('ACTIVE SONAR [PPI]', cx - 55, cy + radius + 22);

    ctx.restore();
  }

  drawShieldQuadrantArray(ctx, cx, cy, radius) {
    ctx.save();
    ctx.lineWidth = 6;

    const quadrants = [
      { name: 'bow', start: -Math.PI * 0.75, end: -Math.PI * 0.25 },
      { name: 'starboard', start: -Math.PI * 0.25, end: Math.PI * 0.25 },
      { name: 'stern', start: Math.PI * 0.25, end: Math.PI * 0.75 },
      { name: 'port', start: Math.PI * 0.75, end: Math.PI * 1.25 }
    ];

    quadrants.forEach(q => {
      const isFocused = this.focusedQuadrant === q.name;
      const isAll = this.focusedQuadrant === 'all';

      ctx.beginPath();
      ctx.arc(cx, cy, radius, q.start + 0.1, q.end - 0.1);

      if (isFocused) {
        ctx.strokeStyle = this.colors.alertCyan;
        ctx.shadowColor = this.colors.alertCyan;
        ctx.shadowBlur = 15;
      } else if (isAll) {
        ctx.strokeStyle = this.colors.neonGreen;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = this.colors.dimGreen;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    });

    // Center sub profile silhouette
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.colors.dimGreen;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 15, cy - 35, 30, 70);

    ctx.fillStyle = this.colors.neonGreen;
    ctx.font = '12px monospace';
    ctx.fillText(`SHIELDS: ${this.focusedQuadrant.toUpperCase()}`, cx - 55, cy + radius + 22);

    ctx.restore();
  }

  drawAcousticMeter(ctx, x, y, telemetry) {
    ctx.save();
    ctx.strokeStyle = this.colors.dimGreen;
    ctx.strokeRect(x, y, 160, 24);

    const fillRatio = Math.min(1.0, this.acousticDb / 80.0);
    ctx.fillStyle = this.silentRunning ? this.colors.alertCyan : this.colors.neonGreen;
    ctx.fillRect(x + 2, y + 2, (160 - 4) * fillRatio, 20);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(`ACOUSTIC: ${this.acousticDb.toFixed(1)} dB`, x, y - 8);
    ctx.fillText(this.silentRunning ? '[SILENT RUNNING]' : '[STANDARD]', x + 170, y + 16);
    ctx.restore();
  }

  drawWeaponBay(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = this.colors.dimGreen;
    ctx.strokeRect(x, y, 220, 24);

    if (this.torpedoState === 'ARMED') {
      ctx.fillStyle = this.colors.neonGreen;
      ctx.fillRect(x + 2, y + 2, 216, 20);
      ctx.fillStyle = '#070b12';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('TORPEDO: ARMED & READY', x + 16, y + 16);
    } else {
      ctx.fillStyle = this.colors.warningRed;
      ctx.fillRect(x + 2, y + 2, 216 * this.reloadProgress, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`${this.torpedoState}: ${(this.reloadProgress * 100).toFixed(0)}%`, x + 16, y + 16);
    }
    ctx.restore();
  }

  drawTelemetryReadout(ctx, cx, y, telemetry) {
    ctx.save();
    ctx.fillStyle = this.colors.neonGreen;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';

    const speed = ((telemetry.speed || 0) * 1.94384).toFixed(1); // M/s to knots
    const depth = Math.abs(telemetry.depth || 142.0).toFixed(1);
    const heading = Math.round(telemetry.heading || 0);

    ctx.fillText(
      `SPD: ${speed} KTS  |  DEPTH: ${depth} M  |  HDG: ${heading.toString().padStart(3, '0')}°`,
      cx,
      y
    );
    ctx.restore();
  }
}