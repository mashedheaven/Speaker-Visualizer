/**
 * ArcReactor - Holographic Arc Reactor Core Audio Visualizer
 * Inspired by Tony Stark's Mark series Arc Reactor & JARVIS interface.
 * Canvas 2D, zero-dependency, HiDPI aware.
 */

export class ArcReactor {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.options = Object.assign({
      primaryColor: '#00d4ff',
      secondaryColor: '#a855f7',
      glowColor: 'rgba(0, 212, 255, 0.4)',
      particleCount: 50,
      segmentCount: 24,
      innerSegmentCount: 12
    }, options);

    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'response'
    this.audioData = null;
    this.audioLevel = 0;
    this.smoothedLevel = 0;
    this.animId = null;
    this.time = 0;

    // Dimensions
    this.width = 0;
    this.height = 0;
    this.cx = 0;
    this.cy = 0;
    this.radius = 40;

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
        distRatio: 0.3 + Math.random() * 0.7, // 0.3 to 1.0 of max radius
        baseSpeed: (0.01 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1),
        currentSpeed: 0.01,
        size: 1 + Math.random() * 2.2,
        alpha: 0.3 + Math.random() * 0.7,
        hueShift: Math.random() > 0.8 ? 280 : 190 // mostly cyan, some purple
      });
    }
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || this.canvas.width || 240;
    this.height = rect.height || this.canvas.height || 96;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.radius = Math.min(this.width, this.height) * 0.42;
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
    this.time += 0.016; // ~60fps step
    // Smooth audio reactivity
    this.smoothedLevel += (this.audioLevel - this.smoothedLevel) * 0.25;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    // Additive blending for realistic holographic neon glow
    ctx.globalCompositeOperation = 'screen';

    // 1. Central Ambient Glow
    this._drawGlow(ctx);

    // 2. Outer Segmented Reactor Ring
    this._drawOuterRing(ctx);

    // 3. Inner Counter-Rotating Ring & Technology Markings
    this._drawInnerRing(ctx);

    // 4. Energy Tendrils
    this._drawTendrils(ctx);

    // 5. Orbiting Energy Particles
    this._drawParticles(ctx);

    // 6. Center Power Core Orb
    this._drawCore(ctx);

    ctx.restore();

    this.animId = requestAnimationFrame(this._render);
  }

  _drawGlow(ctx) {
    const pulseSpeed = this.state === 'listening' ? 4 : this.state === 'processing' ? 6 : 1.5;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * pulseSpeed) + this.smoothedLevel * 0.5;
    const glowRadius = Math.max(10, this.radius * 1.5 * pulse);

    const grad = ctx.createRadialGradient(this.cx, this.cy, 2, this.cx, this.cy, glowRadius);
    const cyanAlpha = this.state === 'listening' ? 0.45 : this.state === 'processing' ? 0.6 : 0.25;
    grad.addColorStop(0, `rgba(0, 240, 255, ${cyanAlpha})`);
    grad.addColorStop(0.35, `rgba(0, 180, 255, ${cyanAlpha * 0.45})`);
    grad.addColorStop(0.7, `rgba(168, 85, 247, ${cyanAlpha * 0.15})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawOuterRing(ctx) {
    const segments = this.options.segmentCount;
    const segAngle = (Math.PI * 2) / segments;
    const gap = 0.05; // Gap between segments in radians
    const baseRadius = this.radius * 0.88;
    const ringWidth = Math.max(2.5, this.radius * 0.1);

    // Slow rotation
    const rotation = this.time * 0.2;

    for (let i = 0; i < segments; i++) {
      const startAngle = rotation + i * segAngle + gap / 2;
      const endAngle = rotation + (i + 1) * segAngle - gap / 2;

      // Frequency reactivity per segment
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
      ctx.arc(this.cx, this.cy, baseRadius + intensity * 4, startAngle, endAngle);
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = `rgba(0, 212, 255, ${0.2 + intensity * 0.75})`;
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 8 + intensity * 12;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawInnerRing(ctx) {
    const segments = this.options.innerSegmentCount;
    const segAngle = (Math.PI * 2) / segments;
    const innerRadius = this.radius * 0.58;
    const rotation = -this.time * 0.35; // Counter-clockwise

    ctx.save();
    // Inner thin guide circle
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, innerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < segments; i++) {
      const angle = rotation + i * segAngle;
      const x1 = this.cx + Math.cos(angle) * (innerRadius - 3);
      const y1 = this.cy + Math.sin(angle) * (innerRadius - 3);
      const x2 = this.cx + Math.cos(angle) * (innerRadius + 3);
      const y2 = this.cy + Math.sin(angle) * (innerRadius + 3);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = (i % 3 === 0) ? 'rgba(0, 240, 255, 0.8)' : 'rgba(168, 85, 247, 0.5)';
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTendrils(ctx) {
    const tendrilCount = 6;
    const baseR = this.radius * 0.35;
    const targetR = this.radius * (1.0 + this.smoothedLevel * 0.5);

    ctx.save();
    for (let i = 0; i < tendrilCount; i++) {
      const angle = (i / tendrilCount) * Math.PI * 2 + this.time * 0.5;
      const startX = this.cx + Math.cos(angle) * baseR;
      const startY = this.cy + Math.sin(angle) * baseR;

      const endAngle = angle + (Math.sin(this.time * 2 + i) * 0.5);
      const endX = this.cx + Math.cos(endAngle) * targetR;
      const endY = this.cy + Math.sin(endAngle) * targetR;

      // Control point curved by audio intensity
      const cpDist = (baseR + targetR) * 0.5;
      const cpAngle = angle + 0.4 + this.smoothedLevel * 0.5;
      const cpX = this.cx + Math.cos(cpAngle) * cpDist;
      const cpY = this.cy + Math.sin(cpAngle) * cpDist;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);

      const alpha = 0.2 + this.smoothedLevel * 0.6;
      ctx.strokeStyle = (i % 2 === 0)
        ? `rgba(0, 212, 255, ${alpha})`
        : `rgba(168, 85, 247, ${alpha * 0.7})`;
      ctx.lineWidth = 1 + this.smoothedLevel * 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawParticles(ctx) {
    const maxR = this.radius * 0.95;
    const speedMultiplier = this.state === 'listening' ? 1 + this.smoothedLevel * 3.5 :
                            this.state === 'processing' ? 3.0 : 1.0;

    for (let p of this.particles) {
      if (this.state === 'processing') {
        // Spiral inward during processing
        p.distRatio = Math.max(0.15, p.distRatio - 0.005);
        p.angle += p.baseSpeed * 4;
      } else if (this.state === 'response') {
        // Expand outward during response
        p.distRatio = Math.min(1.2, p.distRatio + 0.015);
        p.angle += p.baseSpeed * 2;
      } else {
        // Normal orbital drift
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
      ctx.fillStyle = `hsla(${p.hueShift}, 90%, 65%, ${p.alpha * (0.4 + this.smoothedLevel * 0.6)})`;
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
    // Core radial glow
    const coreGrad = ctx.createRadialGradient(this.cx, this.cy, 1, this.cx, this.cy, coreR * 1.5);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, 'rgba(0, 240, 255, 0.9)');
    coreGrad.addColorStop(0.7, 'rgba(0, 160, 255, 0.4)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14 + this.smoothedLevel * 18;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, coreR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Center bright dot
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, coreR * 0.4, 0, Math.PI * 2);
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
