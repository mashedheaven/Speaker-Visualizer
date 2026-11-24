/**
 * jarvisVoice.js - JARVIS Voice Engine & Audio Telemetry
 * Provides British-accented TTS voice synthesis, procedural holographic
 * sound effects (Web Audio API), wake word parsing, and vocal persona responses.
 */

import { EventEmitter } from './utils.js';
import { getSharedAudioContext } from './audioContext.js';

export class JarvisVoice extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = Object.assign({
      enabled: true,
      voiceName: '',
      rate: 1.05,
      pitch: 0.95,
      volume: 1.0,
      soundEffects: true
    }, options);

    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.selectedVoice = null;
    this.isSpeaking = false;

    this._initVoices();
  }

  _getAudioContext() {
    return getSharedAudioContext();
  }

  _initVoices() {
    if (!this.synth) return;

    const load = () => {
      this.voices = this.synth.getVoices();
      this._selectBestJarvisVoice();
    };

    load();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = load;
    }
  }

  _selectBestJarvisVoice() {
    if (!this.voices || this.voices.length === 0) return;

    // Prioritize natural British male voices (JARVIS Paul Bettany aesthetic)
    const preferredNames = [
      'Daniel',           // macOS British male (exceptional fit)
      'Arthur',           // macOS British
      'Oliver',           // macOS British
      'Google UK English Male',
      'en-GB',
      'George',
      'British English'
    ];

    for (const name of preferredNames) {
      const match = this.voices.find(v => 
        v.name.includes(name) || (v.lang === 'en-GB' && v.name.toLowerCase().includes('male'))
      );
      if (match) {
        this.selectedVoice = match;
        return;
      }
    }

    // Fallback: any en-GB voice
    const gbVoice = this.voices.find(v => v.lang === 'en-GB');
    if (gbVoice) {
      this.selectedVoice = gbVoice;
      return;
    }

    // Default English fallback
    const enVoice = this.voices.find(v => v.lang && v.lang.startsWith('en'));
    this.selectedVoice = enVoice || this.voices[0];
  }

  /**
   * Procedural sci-fi HUD sound effects using Web Audio API oscillators.
   * Zero external MP3/WAV assets required.
   */
  playChime(type = 'activate') {
    if (!this.options.soundEffects) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    try {
      if (type === 'activate') {
        // High-tech holographic double-ping (880Hz -> 1760Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, now + 0.09);
        osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.35);
      } else if (type === 'acknowledge') {
        // Subtle affirmative chirp (1200Hz -> 1600Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.12);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'complete') {
        // Tri-tone holographic chord completion (660Hz + 990Hz + 1320Hz)
        [660, 990, 1320].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);

          gain.gain.setValueAtTime(0.08, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 + idx * 0.05);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.04);
          osc.stop(now + 0.45 + idx * 0.05);
        });
      } else if (type === 'error') {
        // Low sci-fi caution buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.25);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (err) {
      console.warn('Procedural chime error:', err);
    }
  }

  /**
   * Speak response using Web Speech Synthesis.
   * Emits 'start', 'end', and audio simulation pulses for Arc Reactor sync.
   */
  speak(text, options = {}) {
    if (!this.synth || !this.options.enabled || !text) return Promise.resolve();

    return new Promise((resolve) => {
      // Cancel any ongoing utterance
      this.synth.cancel();

      const cleanText = text.replace(/[*#_`]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);

      utterance.voice = this.selectedVoice || null;
      utterance.rate = options.rate || this.options.rate;
      utterance.pitch = options.pitch || this.options.pitch;
      utterance.volume = options.volume || this.options.volume;

      let pulseInterval = null;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.emit('start', cleanText);

        // Generate synthetic audio frequency pulses for the Arc Reactor to dance to
        pulseInterval = setInterval(() => {
          if (!this.isSpeaking) {
            clearInterval(pulseInterval);
            return;
          }
          const simulatedData = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            simulatedData[i] = Math.floor(60 + Math.random() * 140);
          }
          this.emit('voiceData', simulatedData);
        }, 60);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (pulseInterval) clearInterval(pulseInterval);
        this.emit('end');
        resolve();
      };

      utterance.onerror = (e) => {
        this.isSpeaking = false;
        if (pulseInterval) clearInterval(pulseInterval);
        console.warn('SpeechSynthesis error:', e);
        this.emit('end');
        resolve();
      };

      this.synth.speak(utterance);
    });
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.emit('end');
  }

  /**
   * Inspect transcript for wake words ('Jarvis', 'Hey Jarvis', 'OK Jarvis', 'Oh Jarvis')
   */
  detectWakeWord(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { detected: false, cleanText: rawText, isWakeOnly: false };
    }

    const trimmed = rawText.trim();
    const wakeRegex = /^(?:(?:hey|hi|hello|ok|okay|oh)\s+)?jarvis[\s,.:!?-]*/i;

    if (wakeRegex.test(trimmed)) {
      const clean = trimmed.replace(wakeRegex, '').trim();
      return {
        detected: true,
        cleanText: clean,
        isWakeOnly: clean.length === 0
      };
    }

    // Also detect Jarvis anywhere in the sentence as an invocation
    const inlineMatch = /\bjarvis\b/i.test(trimmed);
    if (inlineMatch) {
      const clean = trimmed.replace(/\bjarvis\b[,.:!?-]*/gi, '').trim();
      return {
        detected: true,
        cleanText: clean,
        isWakeOnly: clean.length === 0
      };
    }

    return { detected: false, cleanText: trimmed, isWakeOnly: false };
  }

  /**
   * Authentic JARVIS acknowledgments based on context
   */
  getGreeting() {
    const greetings = [
      "Online and listening, sir.",
      "At your service, sir.",
      "Right here, sir.",
      "Yes, sir? How may I assist?",
      "Standing by, sir."
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  getAcknowledgment(intentType) {
    switch (intentType) {
      case 'WEATHER':
        return "Accessing meteorological telemetry, sir.";
      case 'PLACE':
        return "Retrieving global architectural records, sir.";
      case 'FACT':
        return "Querying primary database now, sir.";
      case 'BRAINSTORM':
        return "Generating creative permutations for you, sir.";
      case 'TIMER':
        return "Synchronizing chronometer, sir.";
      case 'SYSTEM':
        return "Initiating full hardware diagnostics, sir.";
      case 'FINANCE':
        return "Fetching real-time market valuations, sir.";
      case 'NEWS':
        return "Assembling global intelligence wire, sir.";
      case 'CALCULATOR':
        return "Computing mathematical solution, sir.";
      case 'MUSIC':
        return "Accessing sonic archives, sir.";
      case 'CALENDAR':
        return "Retrieving your strategic itinerary, sir.";
      case 'SEARCH':
        return "Scanning global web indices, sir.";
      case 'IMAGE':
        return "Materializing visual telemetry, sir.";
      default:
        return "Processing your request, sir.";
    }
  }

  /**
   * Generate concise spoken summary for tile results
   */
  summarizeTileForSpeech(type, data, title) {
    if (!data) return "Information updated on your display, sir.";

    try {
      if (type === 'weather') {
        const temp = Math.round(data.temp);
        const cond = data.condition || 'clear skies';
        const loc = data.location || 'your area';
        return `Current weather in ${loc} is ${temp} degrees Celsius with ${cond}.`;
      }

      if (type === 'place') {
        const placeName = data.title || title || 'the location';
        const summary = (data.summary || '').split('.')[0];
        return `${placeName}. ${summary}.`;
      }

      if (type === 'fact') {
        const content = data.content || '';
        // Extract first non-header sentence
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length > 0) {
          const firstSentence = lines[0].replace(/[*_`]/g, '').split('.')[0];
          return `${firstSentence}. Details materialized on screen, sir.`;
        }
        return `I've assembled the overview for ${title}, sir.`;
      }

      if (type === 'brainstorm') {
        const count = data.ideas?.length || 0;
        return `I have generated ${count} strategic concepts for ${title}.`;
      }

      if (type === 'timer') {
        const m = Math.floor(data.totalSeconds / 60);
        const s = data.totalSeconds % 60;
        const durationStr = m > 0 ? (s > 0 ? `${m} minutes and ${s} seconds` : `${m} minutes`) : `${s} seconds`;
        return `Timer initiated for ${durationStr}, sir.`;
      }

      if (type === 'system') {
        return `System telemetry online. Arc Reactor output is ${data.reactor.output}%, CPU load at ${data.cpu.loadPct}%. All systems optimal, sir.`;
      }

      if (type === 'finance') {
        const direction = data.isPositive ? 'up' : 'down';
        return `${data.name} is currently ${data.price}, ${direction} ${data.changePct} over twenty-four hours.`;
      }

      if (type === 'news') {
        const topArticle = data.articles?.[0]?.title || 'Latest headlines assembled';
        return `Intelligence wire updated for ${data.topic}. Top development: ${topArticle}.`;
      }

      if (type === 'calculator') {
        return data.spokenResult || `The calculation result is ${data.result}, sir.`;
      }

      if (type === 'music') {
        return `Now cueing ${data.title} by ${data.artist}, sir.`;
      }

      if (type === 'calendar') {
        return `You have ${data.events?.length || 3} items scheduled today, sir. Next up: ${data.events?.[0]?.title || 'Diagnostic Review'}.`;
      }

      if (type === 'webSearch') {
        return `I located ${data.results?.length || 0} primary sources on ${data.query}, sir. References materialized on screen.`;
      }

      if (type === 'imageSearch') {
        return `Visual assets for ${data.query} materialized on your HUD, sir.`;
      }
    } catch (e) {
      console.warn('Error formatting speech summary:', e);
    }

    return `Details for ${title} are now on your display, sir.`;
  }
}
