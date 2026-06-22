// ──────────────────────────────────────────────
// speech.js – Real-time speech recognition +
//             audio waveform visualization
// ──────────────────────────────────────────────

import { EventEmitter, getApiKeys } from './utils.js';

/**
 * Gemini-powered STT engine. Captures audio via MediaRecorder in 3.5s chunks,
 * sends them to the Gemini API, and emits 'final' text events.
 */
export class SpeechEngine extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.mediaRecorder = null;
    this.stream = null;
    this.chunkTimer = null;
    this.apiKey = '';
    this.model = 'gemini-3.5-flash';
    this.hasVoiceActivity = false;
  }

  static isSupported() {
    return !!window.MediaRecorder;
  }

  async start() {
    if (this.state === 'listening') return;

    const keys = getApiKeys();
    if (!keys.gemini) {
      this.emit('error', 'Gemini API Key is required for speech recognition.');
      return;
    }
    this.apiKey = keys.gemini;
    if (keys.model) this.model = keys.model;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.emit('error', `Microphone access denied: ${err.message}`);
      return;
    }

    this._setState('listening');
    this._recordNextChunk();
  }

  _recordNextChunk() {
    if (this.state !== 'listening') return;

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    this.chunks = [];
    this.hasVoiceActivity = false;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = async () => {
      if (this.chunks.length > 0 && this.hasVoiceActivity) {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        // Emit an interim loading state so the UI knows it's processing
        this.emit('interim', '...'); 
        
        const text = await this._transcribeChunk(blob);
        if (text && text.length > 0) {
          // Clear interim and emit final
          this.emit('interim', '');
          this.emit('final', text);
        } else {
          this.emit('interim', '');
        }
      } else if (this.chunks.length > 0 && !this.hasVoiceActivity) {
        // Skip API call to save rate limit
        this.emit('interim', '');
      }

      if (this.state === 'listening') {
        this._recordNextChunk();
      }
    };

    this.mediaRecorder.start();

    // Prevent massive memory buildup by forcing a flush every 15s.
    // If no voice was detected, it drops silently without hitting the API.
    this.chunkTimer = setTimeout(() => {
      this.flushAndTranscribe();
    }, 15000);
  }

  flushAndTranscribe() {
    clearTimeout(this.chunkTimer);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  async _transcribeChunk(blob) {
    try {
      const base64Audio = await this._blobToBase64(blob);
      const payload = {
        contents: [{
          parts: [
            { text: "Transcribe the following audio accurately. Output ONLY the transcript. Do not output anything if there is no speech or it's just noise." },
            {
              inlineData: {
                mimeType: "audio/webm",
                data: base64Audio.split(',')[1]
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
        }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`${response.status} - ${errJson.error?.message || 'Unknown API Error'}`);
      }
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      
      // Filter out common hallucinations Gemini produces for silence
      const lower = text.toLowerCase();
      console.log('Raw STT transcript:', text);
      if (lower.includes('no audio') || lower.includes('no speech') || lower.match(/^\[(.*)\]$/)) return null;
      
      return text;
    } catch (err) {
      console.error('STT Error:', err);
      this.emit('error', `Speech Transcription Failed: ${err.message}`);
      return null;
    }
  }

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  stop() {
    this._setState('idle');
    clearTimeout(this.chunkTimer);
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null; // Prevent loop
      this.mediaRecorder.stop();
    }
    
    this.stream?.getTracks().forEach(t => t.stop());
    
    this.mediaRecorder = null;
    this.stream = null;
  }

  toggle() {
    if (this.state === 'listening') {
      this.stop();
    } else {
      this.start();
    }
  }

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
