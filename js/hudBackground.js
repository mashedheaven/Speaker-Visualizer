/**
 * HudBackground - Futuristic JARVIS HUD Ambient Canvas Layer
 * Renders perspective grid lines, hex grids with random pulses,
 * floating telemetry particles, data streams, and corner reticles.
 * Zero dependencies, high performance, HiDPI aware.
 */

export class HudBackground {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.options = Object.assign({
      particleCount: 60,
      hexRadius: 28,
      primaryColor: '#00d4ff',
      secondaryColor: '#a855f7'
    }, options);

    this.width = 0;
    this.height = 0;
    this.intensity = 0.5; // 0.0 (calm) to 1.0 (active)
    this.audioLevel = 0;
    this.smoothedAudio = 0;
    this.time = 0;
    this.animId = null;

    // Particles
    this.particles = [];
    this._initParticles();

    // Hex pulse tracking
    this.activeHexes = []; // { q, r, x, y, progress: 0..1, maxAlpha }
    this.lastHexPulseTime = 0;

    // Data streams
    this.dataStreams = []; // { y, x, speed, length, alpha, charWidth }
    this._initDataStreams();

    this._render = this._render.bind(this);
    this.resize();
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.options.particleCount; i++) {
      this.particles.push({
        x: Math.random() * (this.width || 1200),
        y: Math.random() * (this.height || 800),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() > 0.85 ? 2.0 : 1.2,
        alpha: 0.15 + Math.random() * 0.35,
        color: Math.random() > 0.7 ? '#a855f7' : '#00d4ff'
      });
    }
  }

  _initDataStreams() {
    this.dataStreams = [
      { y: 120, x: -100, speed: 1.8, length: 12, alpha: 0.25 },
      { y: 340, x: -250, speed: 2.4, length: 18, alpha: 0.18 },
      { y: 560, x: -80, speed: 1.2, length: 8, alpha: 0.22 }
    ];
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for performance
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  start() {
    if (this.animId) return;
    this.resize();
    this.animId = requestAnimationFrame(this._render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  updateAudioData(data) {
    if (data && data.length > 0) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      this.audioLevel = (sum / data.length) / 255;
    } else {
      this.audioLevel = 0;
    }
  }

  setIntensity(level) {
    this.intensity = Math.max(0, Math.min(1, level));
  }

  _render() {
    this.time += 0.016;
    this.smoothedAudio += (this.audioLevel - this.smoothedAudio) * 0.15;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    // 1. Perspective Depth Grid
    this._drawPerspectiveGrid(ctx);

    // 2. Hexagonal Grid & Pulses
    this._drawHexGrid(ctx);

    // 3. Telemetry Data Streams
    this._drawDataStreams(ctx);

    // 4. Floating HUD Particles
    this._drawParticles(ctx);

    // 5. Targeting Corner Brackets
    this._drawCornerReticles(ctx);
    ctx.restore();

    this.animId = requestAnimationFrame(this._render);
  }

  _drawPerspectiveGrid(ctx) {
    const horizonY = this.height * 0.88;
    const vpX = this.width * 0.5;
    const vpY = horizonY;
    const boost = this.smoothedAudio * 0.08;

    ctx.save();
    ctx.lineWidth = 1;

    // Longitudinal perspective rays converging to center-bottom
    const numRays = 18;
    for (let i = 0; i <= numRays; i++) {
      const bottomX = (this.width / numRays) * i;
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(bottomX, this.height);
      ctx.strokeStyle = `rgba(0, 212, 255, ${0.02 + boost})`;
      ctx.stroke();
    }

    // Horizontal perspective lines with logarithmic spacing
    const numHoriz = 6;
    for (let i = 1; i <= numHoriz; i++) {
      const factor = Math.pow(i / numHoriz, 1.8);
      const y = horizonY + (this.height - horizonY) * factor;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.strokeStyle = `rgba(0, 212, 255, ${0.015 + factor * 0.04 + boost})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawHexGrid(ctx) {
    // Only draw a cluster of hex lines in corners/subtle areas for peak performance
    const r = this.options.hexRadius;
    const h = r * Math.sqrt(3);

    // Occasional random hex pulse trigger
    if (this.time - this.lastHexPulseTime > 2.0 && Math.random() > 0.4) {
      this.lastHexPulseTime = this.time;
      const rx = Math.random() * this.width;
      const ry = Math.random() * (this.height * 0.7);
      this.activeHexes.push({
        x: rx,
        y: ry,
        radius: r,
        progress: 0,
        color: Math.random() > 0.6 ? '#a855f7' : '#00d4ff'
      });
    }

    // Update and draw active pulsed hexes
    for (let i = this.activeHexes.length - 1; i >= 0; i--) {
      const hex = this.activeHexes[i];
      hex.progress += 0.015;
      if (hex.progress >= 1.0) {
        this.activeHexes.splice(i, 1);
        continue;
      }

      // Bell curve opacity
      const alpha = Math.sin(hex.progress * Math.PI) * 0.22;
      this._drawSingleHex(ctx, hex.x, hex.y, hex.radius, hex.color, alpha);
    }
  }

  _drawSingleHex(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const hx = x + r * Math.cos(angle);
      const hy = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = color === '#00d4ff'
      ? `rgba(0, 212, 255, ${alpha})`
      : `rgba(168, 85, 247, ${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.fillStyle = color === '#00d4ff'
      ? `rgba(0, 212, 255, ${alpha * 0.25})`
      : `rgba(168, 85, 247, ${alpha * 0.25})`;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawDataStreams(ctx) {
    ctx.save();
    for (const stream of this.dataStreams) {
      stream.x += stream.speed * (1 + this.smoothedAudio * 2.5);
      if (stream.x > this.width + 100) {
        stream.x = -150 - Math.random() * 100;
        stream.y = 80 + Math.random() * (this.height - 180);
      }

      for (let j = 0; j < stream.length; j++) {
        const segX = stream.x - j * 8;
        if (segX < 0 || segX > this.width) continue;
        const segAlpha = stream.alpha * (1 - j / stream.length) * (0.6 + this.smoothedAudio);
        ctx.fillStyle = `rgba(0, 212, 255, ${segAlpha})`;
        ctx.fillRect(segX, stream.y, 4, 1.5);
      }
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    ctx.save();
    const speedMult = 1.0 + this.smoothedAudio * 2.5;

    for (const p of this.particles) {
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;

      // Wrap around edges
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      const alpha = p.alpha * (0.7 + this.smoothedAudio * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color === '#00d4ff'
        ? `rgba(0, 212, 255, ${alpha})`
        : `rgba(168, 85, 247, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCornerReticles(ctx) {
    const size = 32;
    const inset = 16;
    const color = `rgba(0, 212, 255, ${0.12 + this.smoothedAudio * 0.15})`;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(inset, inset + size);
    ctx.lineTo(inset, inset);
    ctx.lineTo(inset + size, inset);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(this.width - inset - size, inset);
    ctx.lineTo(this.width - inset, inset);
    ctx.lineTo(this.width - inset, inset + size);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(inset, this.height - inset - size);
    ctx.lineTo(inset, this.height - inset);
    ctx.lineTo(inset + size, this.height - inset);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(this.width - inset - size, this.height - inset);
    ctx.lineTo(this.width - inset, this.height - inset);
    ctx.lineTo(this.width - inset, this.height - inset - size);
    ctx.stroke();

    ctx.restore();
  }

  destroy() {
    this.stop();
    this.particles = [];
    this.activeHexes = [];
    this.dataStreams = [];
  }
}
