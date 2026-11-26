// ──────────────────────────────────────────────
// speech.js – Gemini/OpenAI-powered STT engine +
//             audio waveform visualization
// ──────────────────────────────────────────────

import { EventEmitter, getApiKeys } from './utils.js';
import { getSharedAudioContext } from './audioContext.js';

/**
 * Multi-provider STT engine. Captures audio via MediaRecorder,
 * uses internal Voice Activity Detection (VAD) to skip silent chunks,
 * and sends audio to the configured API for transcription.
 *
 * Supported providers: 'gemini' (default), 'openai'
 *
 * Events:
 *   'interim'      → (text: string)
 *   'final'        → (text: string)
 *   'stateChange'  → (state: 'idle' | 'listening')
 *   'error'        → (error: string)
 */
export class SpeechEngine extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.chunkTimer = null;
    this.apiKey = '';
    this.model = 'gemini-3.5-flash';
    this.provider = 'gemini';

    // Internal VAD via AnalyserNode
    this._audioCtx = null;
    this._analyser = null;
    this._vadSource = null;
    this._vadData = null;
    this.hasVoiceActivity = false;
    this._vadCheckInterval = null;
    this._mutedByTTS = false;
  }

  /**
   * Prevent JARVIS's own TTS playback from triggering VAD self-transcription.
   * @param {boolean} muted
   */
  setMutedByTTS(muted) {
    this._mutedByTTS = !!muted;
  }

  static isSupported() {
    return !!window.MediaRecorder;
  }

  /**
   * Return the active MediaStream so AudioAnalyzer can share it
   * instead of requesting a separate mic stream.
   */
  getStream() {
    return this.stream;
  }

  async start() {
    if (this.state === 'listening') return;

    const keys = getApiKeys();
    this.provider = keys.provider || 'gemini';

    // Validate API key for selected provider
    if (this.provider === 'openai') {
      if (!keys.openai) {
        this.emit('error', 'OpenAI API Key is required for speech recognition.');
        return;
      }
      this.apiKey = keys.openai;
    } else {
      if (!keys.gemini) {
        this.emit('error', 'Gemini API Key is required for speech recognition.');
        return;
      }
      this.apiKey = keys.gemini;
      if (keys.model) this.model = keys.model;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.emit('error', `Microphone access denied: ${err.message}`);
      return;
    }

    // Set up internal VAD using AnalyserNode
    this._setupVAD();

    this._setState('listening');
    this._recordNextChunk();
  }

  _setupVAD() {
    try {
      this._audioCtx = getSharedAudioContext();
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.8;
      this._vadSource = this._audioCtx.createMediaStreamSource(this.stream);
      this._vadSource.connect(this._analyser);
      this._vadData = new Uint8Array(this._analyser.frequencyBinCount);

      // Check audio levels every 100ms
      this._vadCheckInterval = setInterval(() => {
        if (!this._analyser || this._mutedByTTS) return;
        this._analyser.getByteFrequencyData(this._vadData);
        let sum = 0;
        for (let i = 0; i < this._vadData.length; i++) sum += this._vadData[i];
        const avg = sum / this._vadData.length;
        if (avg > 8) {
          this.hasVoiceActivity = true;
        }
      }, 100);
    } catch (e) {
      console.warn('VAD setup failed, will transcribe all chunks:', e);
      this.hasVoiceActivity = true; // Fallback: transcribe everything
    }
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
        this.emit('interim', '...');
        
        const text = await this._transcribeChunk(blob);
        if (text && text.length > 0) {
          this.emit('interim', '');
          this.emit('final', text);
        } else {
          this.emit('interim', '');
        }
      } else if (this.chunks.length > 0 && !this.hasVoiceActivity) {
        this.emit('interim', '');
      }

      if (this.state === 'listening') {
        this._recordNextChunk();
      }
    };

    this.mediaRecorder.start();

    // Safety flush every 15s to prevent memory buildup
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

  async _transcribeChunk(blob, retryCount = 0) {
    try {
      if (this.provider === 'openai') {
        return await this._transcribeOpenAI(blob);
      }
      return await this._transcribeGemini(blob);
    } catch (err) {
      // Retry on 429 (rate limit) with exponential backoff
      if (err.message.includes('429') && retryCount < 3) {
        const delay = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
        console.warn(`Rate limited. Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/3)`);
        await new Promise(r => setTimeout(r, delay));
        return this._transcribeChunk(blob, retryCount + 1);
      }
      console.error('STT Error:', err);
      this.emit('error', `Transcription failed: ${err.message}`);
      return null;
    }
  }

  async _transcribeGemini(blob) {
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
      generationConfig: { temperature: 0.1 }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`${response.status} - ${errJson.error?.message || 'Gemini API Error'}`);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    
    // Filter silence hallucinations
    const lower = text.toLowerCase();
    if (lower.includes('no audio') || lower.includes('no speech') || lower.match(/^\[(.*)\]$/)) return null;
    
    return text;
  }

  async _transcribeOpenAI(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`${response.status} - ${errJson.error?.message || 'OpenAI API Error'}`);
    }

    const text = (await response.text()).trim();
    if (!text || text.length < 2) return null;
    return text;
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
    clearInterval(this._vadCheckInterval);
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    
    this._vadSource?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    
    this.mediaRecorder = null;
    this.stream = null;
    this._audioCtx = null;
    this._analyser = null;
    this._vadSource = null;
    this._vadData = null;
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
 *
 * Can accept an existing MediaStream (shared with SpeechEngine)
 * to avoid requesting a second mic stream.
 */
export class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.isActive = false;
    this._ownsStream = false;
    this._stream = null;
  }

  /**
   * Initialize the Web Audio pipeline.
   * @param {MediaStream} [existingStream] Optional shared stream from SpeechEngine
   */
  async start(existingStream) {
    let stream;
    if (existingStream) {
      stream = existingStream;
      this._ownsStream = false;
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        throw new Error(`Microphone access denied: ${err.message}`);
      }
      this._ownsStream = true;
    }
    this._stream = stream;

    this.audioContext = getSharedAudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.isActive = true;
  }

  /**
   * Snapshot current frequency data into `this.dataArray` and return it.
   * @returns {Uint8Array | null}
   */
  getFrequencyData() {
    if (!this.analyser || !this.isActive) return null;
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  /**
   * Render a frequency-bar waveform onto the given `<canvas>`.
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
      const dataIndex = Math.floor(i * data.length / barCount);
      const value = data[dataIndex] / 255;
      const barHeight = Math.max(2, value * height * 0.9);

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
    this.source?.disconnect();

    // Only stop stream tracks if we own them (not shared)
    if (this._ownsStream && this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
    }

    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this._stream = null;
  }
}
