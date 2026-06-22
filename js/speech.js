// ──────────────────────────────────────────────
// speech.js – Real-time speech recognition +
//             audio waveform visualization
// ──────────────────────────────────────────────

import { EventEmitter } from './utils.js';

/**
 * Wraps the Web Speech API (`SpeechRecognition`) for continuous, real-time
 * speech-to-text.  Emits interim and final transcript events and
 * auto-restarts when Chrome's ~60 s timeout fires.
 *
 * Events:
 *   'interim'      → (text: string)
 *   'final'        → (text: string)
 *   'stateChange'  → (state: 'idle' | 'listening' | 'error')
 *   'error'        → (error: string)
 */
export class SpeechEngine extends EventEmitter {
  constructor() {
    super();
    this.recognition = null;
    this.state = 'idle';
    this._shouldRestart = false;
    this._restartTimer = null;
    this._consecutiveNetworkErrors = 0;
  }

  /** Feature-detect the Web Speech API. */
  static isSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  /**
   * Begin listening.
   * @param {string} lang  BCP-47 language tag (default `en-US`).
   */
  start(lang = 'en-US') {
    // Prevent double-start
    if (this.state === 'listening') return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.emit('error', 'Speech recognition is not supported in this browser.');
      this._setState('error');
      return;
    }

    this._shouldRestart = true;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    // ── Result handler ──────────────────────────
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          this.emit('final', text);
        } else {
          this.emit('interim', text);
        }
      }
    };

    // ── Start handler ───────────────────────────
    recognition.onstart = () => {
      this._consecutiveNetworkErrors = 0;
      this._setState('listening');
    };

    // ── End handler (auto-restart) ──────────────
    recognition.onend = () => {
      if (this._shouldRestart) {
        // If we encountered a network error, back off (e.g. wait 2.5 seconds)
        const delay = this._consecutiveNetworkErrors > 0 ? 2500 : 300;
        this._restartTimer = setTimeout(() => {
          this._restartTimer = null;
          if (this._shouldRestart) {
            try {
              recognition.start();
            } catch {
              // Already started – swallow
            }
          }
        }, delay);
      } else {
        this._setState('idle');
      }
    };

    // ── Error handler ───────────────────────────
    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are non-fatal – just let auto-restart handle them.
      const nonFatal = new Set(['no-speech', 'aborted']);

      if (event.error === 'network') {
        this._consecutiveNetworkErrors++;
        if (this._consecutiveNetworkErrors <= 3) {
          this.emit('warning', `Network glitch detected. Retrying speech connection (attempt ${this._consecutiveNetworkErrors}/3)...`);
          return; // Let the onend handler auto-restart
        }
      }

      if (!nonFatal.has(event.error)) {
        this.emit('error', `Speech recognition error: ${event.error}`);
        this._setState('error');
        // Stop attempting to restart on fatal errors
        this._shouldRestart = false;
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch (err) {
      this.emit('error', `Could not start recognition: ${err.message}`);
      this._setState('error');
    }
  }

  /** Stop listening and tear down. */
  stop() {
    this._shouldRestart = false;
    this._consecutiveNetworkErrors = 0;
    clearTimeout(this._restartTimer);
    this._restartTimer = null;

    try {
      this.recognition?.stop();
    } catch {
      // Already stopped – ignore
    }

    this.recognition = null;
    this._setState('idle');
  }

  /** Convenience toggle. */
  toggle(lang) {
    if (this.state === 'listening') {
      this.stop();
    } else {
      this.start(lang);
    }
  }

  /** @private */
  _setState(state) {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// AudioAnalyzer – microphone → AnalyserNode → canvas waveform bars
// ─────────────────────────────────────────────────────────────────────

/**
 * Captures microphone audio via the Web Audio API and exposes frequency
 * data for real-time waveform visualisation on a `<canvas>`.
 */
export class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.stream = null;
    this.source = null;
    this.isActive = false;
    this._animationId = null;
  }

  /**
   * Request microphone access and initialise the Web Audio pipeline.
   */
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new Error(`Microphone access denied: ${err.message}`);
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.isActive = true;
  }

  /**
   * Snapshot current frequency data into `this.dataArray` and return it.
   * Call inside a `requestAnimationFrame` loop.
   * @returns {Uint8Array | null}
   */
  getFrequencyData() {
    if (!this.analyser || !this.isActive) return null;
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  /**
   * Render a frequency-bar waveform onto the given `<canvas>`.
   *
   * Bars are coloured with a cyan → purple gradient and their height
   * tracks the current frequency amplitude.  Only the lower-frequency
   * bins are sampled since they carry more speech-relevant energy.
   *
   * @param {HTMLCanvasElement} canvas
   */
  renderWaveform(canvas) {
    const ctx = canvas.getContext('2d');
    const data = this.getFrequencyData();
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!data) return;

    const barCount = 32;
    const barGap = 2;
    const barWidth = (width / barCount) - barGap;

    for (let i = 0; i < barCount; i++) {
      // Map bar index → frequency bin (biased toward lower frequencies)
      const dataIndex = Math.floor(i * data.length / barCount);
      const value = data[dataIndex] / 255;
      const barHeight = Math.max(2, value * height * 0.9);

      // Gradient hue: 190 (cyan) → 270 (purple) across the bar row
      const hue = 190 + (i / barCount) * 80;
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.4 + value * 0.6})`;

      const x = i * (barWidth + barGap);
      const y = (height - barHeight) / 2;

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }

  /** Tear down the audio pipeline and release the microphone. */
  stop() {
    this.isActive = false;

    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }

    this.stream?.getTracks().forEach(t => t.stop());
    this.source?.disconnect();

    this.audioContext?.close().catch(() => {});

    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.stream = null;
    this.source = null;
  }
}
