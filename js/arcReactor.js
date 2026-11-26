/**
 * ArcReactor - Holographic Arc Reactor Core Audio Visualizer
 * Inspired by Tony Stark's Mark series Arc Reactor & JARVIS interface.
 * Canvas 2D, zero-dependency, HiDPI aware, reduced-motion aware.
 */

export class ArcReactor {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.options = Object.assign({
      primaryColor: '#00d4ff',
      secondaryColor: '#a855f7',
      glowColor: 'rgba(0, 212, 255, 0.4)',
      particleCount: 54,
      segmentCount: 24,
      innerSegmentCount: 12,
      eqBarCount: 36,
      defaultWidth: 144,
      defaultHeight: 144
    }, options);

    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'response'
    this.audioData = null;
    this.audioLevel = 0;
    this.smoothedLevel = 0;
    this.animId = null;
    this.time = 0;

    // Dimensions (stored strictly in logical CSS pixels)
    this.width = this.options.defaultWidth;
    this.height = this.options.defaultHeight;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radius = Math.min(this.width, this.height) * 0.4;

    this._reducedMotion = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    );

    // Particles
    this.particles = [];
    this._initParticles();

    // Bindings
    this._render = this._render.bind(this);
    this.resize();
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.options.particleCount; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        distRatio: 0.3 + Math.random() * 0.65,
        baseSpeed: (0.01 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1),
        size: 1 + Math.random() * 2.1,
        alpha: 0.3 + Math.random() * 0.7,
        hueShift: Math.random() > 0.78 ? 280 : 190
      });
    }
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect?.() || { width: 0, height: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalW = rect.width || this.canvas.clientWidth || this.width || this.options.defaultWidth;
    const logicalH = rect.height || this.canvas.clientHeight || this.height || this.options.defaultHeight;

    this.width = logicalW;
    this.height = logicalH;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radius = Math.max(14, Math.min(this.width, this.height) * 0.4);
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
    this.audioData = data;
    if (data && data.length > 0) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }
      this.audioLevel = (sum / data.length) / 255;
    } else {
      this.audioLevel = 0;
    }
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
  }

  _render() {
    const dt = this._reducedMotion ? 0.004 : 0.016;
    this.time += dt;
    // Smooth audio reactivity
    this.smoothedLevel += (this.audioLevel - this.smoothedLevel) * 0.25;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // 1. Central Ambient Glow
    this._drawGlow(ctx);

    // 2. Outer HUD Calibration Arcs & Degree Reticles
    this._drawReticleTicks(ctx);

    // 3. Radial Frequency Equalizer Bars (audio-reactive perimeter)
    this._drawEqualizerBars(ctx);

    // 4. Outer Segmented Reactor Ring
    this._drawOuterRing(ctx);

    // 5. Inner Counter-Rotating Ring & Technology Markings
    this._drawInnerRing(ctx);

    // 6. Energy Tendrils
    this._drawTendrils(ctx);

    // 7. Orbiting Energy Particles
    this._drawParticles(ctx);

    // 8. Center Power Core Orb
    this._drawCore(ctx);

    ctx.restore();

    this.animId = requestAnimationFrame(this._render);
  }

  _drawGlow(ctx) {
    const pulseSpeed = this.state === 'listening' ? 4 : this.state === 'processing' ? 6 : 1.5;
    const pulse = 0.84 + 0.16 * Math.sin(this.time * pulseSpeed) + this.smoothedLevel * 0.45;
    const glowRadius = Math.max(12, this.radius * 1.42 * pulse);

    const grad = ctx.createRadialGradient(this.cx, this.cy, 2, this.cx, this.cy, glowRadius);
    const cyanAlpha = this.state === 'listening' ? 0.48 : this.state === 'processing' ? 0.56 : 0.26;
    if (this.state === 'processing') {
      grad.addColorStop(0, `rgba(251, 191, 36, ${cyanAlpha * 0.85})`);
      grad.addColorStop(0.35, `rgba(0, 212, 255, ${cyanAlpha * 0.55})`);
      grad.addColorStop(0.75, `rgba(168, 85, 247, ${cyanAlpha * 0.2})`);
    } else {
      grad.addColorStop(0, `rgba(0, 240, 255, ${cyanAlpha})`);
      grad.addColorStop(0.35, `rgba(0, 180, 255, ${cyanAlpha * 0.45})`);
      grad.addColorStop(0.75, `rgba(168, 85, 247, ${cyanAlpha * 0.16})`);
    }
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawReticleTicks(ctx) {
    const reticleR = this.radius * 1.06;
    const rot = this.time * (this.state === 'processing' ? 0.55 : 0.12);
    const accent = this.state === 'processing'
      ? 'rgba(251, 191, 36, 0.5)'
      : 'rgba(0, 212, 255, 0.35)';

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, this.radius * 0.025);

    // 4 precision quadrant bracket arcs
    for (let q = 0; q < 4; q++) {
      const start = rot + q * (Math.PI / 2) + 0.18;
      const end = start + 0.45;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, reticleR, start, end);
      ctx.stroke();

      // Cardinal needle tick
      const tickAngle = rot + q * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(this.cx + Math.cos(tickAngle) * (reticleR - 3), this.cy + Math.sin(tickAngle) * (reticleR - 3));
      ctx.lineTo(this.cx + Math.cos(tickAngle) * (reticleR + 4), this.cy + Math.sin(tickAngle) * (reticleR + 4));
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawEqualizerBars(ctx) {
    const count = this.options.eqBarCount;
    const baseR = this.radius * 0.94;
    const maxSpike = Math.max(4, this.radius * 0.24);
    const rot = this.time * 0.15;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, this.radius * 0.032);

    for (let i = 0; i < count; i++) {
      let amp = 0.08 + 0.04 * Math.sin(this.time * 2.5 + i * 0.6);
      if (this.audioData && this.audioData.length > 0) {
        const idx = Math.floor((i / count) * (this.audioData.length * 0.75));
        amp = Math.max(amp, (this.audioData[idx] / 255) * 0.95);
      } else if (this.state === 'processing') {
        amp = 0.18 + 0.22 * Math.abs(Math.sin(this.time * 5 + i * 0.45));
      }

      const angle = rot + (i / count) * Math.PI * 2;
      const inner = baseR;
      const outer = baseR + amp * maxSpike;

      const x1 = this.cx + Math.cos(angle) * inner;
      const y1 = this.cy + Math.sin(angle) * inner;
      const x2 = this.cx + Math.cos(angle) * outer;
      const y2 = this.cy + Math.sin(angle) * outer;

      ctx.strokeStyle = this.state === 'processing'
        ? `rgba(251, 191, 36, ${0.25 + amp * 0.65})`
        : (i % 4 === 0
          ? `rgba(168, 85, 247, ${0.3 + amp * 0.65})`
          : `rgba(0, 212, 255, ${0.28 + amp * 0.7})`);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawOuterRing(ctx) {
    const segments = this.options.segmentCount;
    const segAngle = (Math.PI * 2) / segments;
    const gap = 0.06;
    const baseRadius = this.radius * 0.8;
    const ringWidth = Math.max(2.2, this.radius * 0.095);

    const speed = this.state === 'processing' ? 0.8 : this.state === 'listening' ? 0.35 : 0.2;
    const rotation = this.time * speed;

    for (let i = 0; i < segments; i++) {
      const startAngle = rotation + i * segAngle + gap / 2;
      const endAngle = rotation + (i + 1) * segAngle - gap / 2;

      let intensity = 0.25;
      if (this.audioData && this.audioData.length > 0) {
        const binIndex = Math.floor((i / segments) * (this.audioData.length * 0.7));
        intensity = Math.max(0.15, this.audioData[binIndex] / 255);
      } else if (this.state === 'listening') {
        intensity = 0.35 + 0.2 * Math.sin(this.time * 3 + i * 0.5);
      } else if (this.state === 'processing') {
        intensity = 0.4 + 0.4 * Math.sin(this.time * 6 - i * 0.8);
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, baseRadius + intensity * 3, startAngle, endAngle);
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = this.state === 'processing' && i % 3 === 0
        ? `rgba(251, 191, 36, ${0.35 + intensity * 0.6})`
        : `rgba(0, 212, 255, ${0.22 + intensity * 0.75})`;
      ctx.shadowColor = this.state === 'processing' ? '#fbbf24' : '#00d4ff';
      ctx.shadowBlur = 8 + intensity * 10;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawInnerRing(ctx) {
    const segments = this.options.innerSegmentCount;
    const segAngle = (Math.PI * 2) / segments;
    const innerRadius = this.radius * 0.54;
    const rotation = -this.time * (this.state === 'processing' ? 0.9 : 0.35);

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, innerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < segments; i++) {
      const angle = rotation + i * segAngle;
      const tickHalf = Math.max(2.5, this.radius * 0.06);
      const x1 = this.cx + Math.cos(angle) * (innerRadius - tickHalf);
      const y1 = this.cy + Math.sin(angle) * (innerRadius - tickHalf);
      const x2 = this.cx + Math.cos(angle) * (innerRadius + tickHalf);
      const y2 = this.cy + Math.sin(angle) * (innerRadius + tickHalf);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = (i % 3 === 0) ? 'rgba(0, 240, 255, 0.85)' : 'rgba(168, 85, 247, 0.55)';
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTendrils(ctx) {
    const tendrilCount = 6;
    const baseR = this.radius * 0.32;
    const targetR = this.radius * (0.9 + this.smoothedLevel * 0.38);

    ctx.save();
    for (let i = 0; i < tendrilCount; i++) {
      const angle = (i / tendrilCount) * Math.PI * 2 + this.time * 0.5;
      const startX = this.cx + Math.cos(angle) * baseR;
      const startY = this.cy + Math.sin(angle) * baseR;

      const endAngle = angle + Math.sin(this.time * 2 + i) * 0.48;
      const endX = this.cx + Math.cos(endAngle) * targetR;
      const endY = this.cy + Math.sin(endAngle) * targetR;

      const cpDist = (baseR + targetR) * 0.5;
      const cpAngle = angle + 0.4 + this.smoothedLevel * 0.45;
      const cpX = this.cx + Math.cos(cpAngle) * cpDist;
      const cpY = this.cy + Math.sin(cpAngle) * cpDist;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);

      const alpha = 0.22 + this.smoothedLevel * 0.58;
      ctx.strokeStyle = (i % 2 === 0)
        ? `rgba(0, 212, 255, ${alpha})`
        : `rgba(168, 85, 247, ${alpha * 0.75})`;
      ctx.lineWidth = 1 + this.smoothedLevel * 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    const maxR = this.radius * 0.88;
    const speedMultiplier =
      this.state === 'listening' ? 1 + this.smoothedLevel * 3.2 :
      this.state === 'processing' ? 3.2 : 1.0;

    for (const p of this.particles) {
      if (this.state === 'processing') {
        p.distRatio = p.distRatio <= 0.16 ? 0.92 : p.distRatio - 0.008;
        p.angle += p.baseSpeed * 4;
      } else if (this.state === 'response') {
        p.distRatio = p.distRatio >= 1.15 ? 0.25 : p.distRatio + 0.014;
        p.angle += p.baseSpeed * 2;
      } else {
        p.angle += p.baseSpeed * speedMultiplier;
        if (p.distRatio > 1.0 || p.distRatio < 0.25) {
          p.distRatio = 0.3 + Math.random() * 0.65;
        }
      }

      const r = p.distRatio * maxR;
      const px = this.cx + Math.cos(p.angle) * r;
      const py = this.cy + Math.sin(p.angle) * r;

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + this.smoothedLevel * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hueShift}, 90%, 65%, ${p.alpha * (0.45 + this.smoothedLevel * 0.55)})`;
      ctx.shadowColor = `hsla(${p.hueShift}, 100%, 50%, 0.8)`;
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawCore(ctx) {
    const coreScale = 1.0 + this.smoothedLevel * 0.3 + (this.state === 'processing' ? Math.sin(this.time * 12) * 0.1 : 0);
    const coreR = Math.max(6, this.radius * 0.22 * coreScale);

    ctx.save();
    const coreGrad = ctx.createRadialGradient(this.cx, this.cy, 1, this.cx, this.cy, coreR * 1.5);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, this.state === 'processing' ? 'rgba(251, 191, 36, 0.9)' : 'rgba(0, 240, 255, 0.92)');
    coreGrad.addColorStop(0.7, 'rgba(0, 160, 255, 0.42)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.shadowColor = this.state === 'processing' ? '#fbbf24' : '#00f0ff';
    ctx.shadowBlur = 14 + this.smoothedLevel * 18;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, coreR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright triangle/circle mark
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, coreR * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  destroy() {
    this.stop();
    this.particles = [];
    this.audioData = null;
  }
}
