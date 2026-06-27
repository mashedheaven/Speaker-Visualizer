// ──────────────────────────────────────────────
// intent.js – Detect user intents from speech
//             transcripts using the Gemini API
// ──────────────────────────────────────────────

import { EventEmitter, debounce, getApiKeys, Cache } from './utils.js';

/**
 * Buffers final transcript text and, after a 1.5 s debounce window,
 * sends it to Gemini for structured intent classification.
 *
 * Events:
 *   'intent'      → ({ type, query, params })
 *   'processing'  → (isProcessing: boolean)
 *   'error'       → (error: string)
 */
export class IntentDetector extends EventEmitter {
  constructor() {
    super();
    this._buffer = '';
    this._cache = new Cache(5 * 60 * 1000); // 5-minute TTL
    this._isProcessing = false;
    this._tileContext = []; // summaries of currently-visible tiles

    // Wait 1.5 s after the last final transcript before calling the LLM
    this._analyze = debounce(this._doAnalyze.bind(this), 1500);
  }

  /**
   * Append a final transcript segment.  The debounced analysis will
   * fire once the user stops speaking for 1.5 s.
   * @param {string} text
   */
  addTranscript(text) {
    if (!text.trim()) return;
    this._buffer += ' ' + text.trim();
    // Cap buffer to prevent unbounded growth during continuous speech
    if (this._buffer.length > 500) {
      this._buffer = this._buffer.slice(-500);
    }
    this._analyze();
  }

  /**
   * Provide the current tile set so the LLM can resolve pronouns
   * (e.g. "what about tomorrow" when a weather tile is visible).
   * @param {Array<{type: string, title: string}>} tiles
   */
  setTileContext(tiles) {
    this._tileContext = tiles.map(t => ({ type: t.type, title: t.title }));
  }

  // ── Private ───────────────────────────────────

  /** @private */
  async _doAnalyze() {
    const text = this._buffer.trim();
    this._buffer = ''; // clear immediately so new speech accumulates fresh

    if (!text || text.length < 3) return;

    // ── Cache hit? ──
    const cacheKey = text.toLowerCase();
    const cached = this._cache.get(cacheKey);
    if (cached) {
      cached.forEach(intent => this.emit('intent', intent));
      return;
    }

    // ── API key check ──
    const keys = getApiKeys();
    if (!keys.gemini) {
      this.emit('error', 'Gemini API key not set. Open Settings to add it.');
      return;
    }

    this._isProcessing = true;
    this.emit('processing', true);

    try {
      const intents = await this._callGemini(text, keys.gemini, keys.model);
      this._cache.set(cacheKey, intents);
      intents.forEach(intent => this.emit('intent', intent));
    } catch (err) {
      this.emit('error', `Intent detection failed: ${err.message}`);
    } finally {
      this._isProcessing = false;
      this.emit('processing', false);
    }
  }

  /**
   * Call the Gemini API to classify intents from raw speech.
   * @private
   * @param {string} text    Raw user speech.
   * @param {string} apiKey  Gemini API key.
   * @param {string} model   Gemini model.
   * @returns {Promise<Array<{type: string, query: string, params: object}>>}
   */
  async _callGemini(text, apiKey, model = 'gemini-3.5-flash') {
    const contextStr =
      this._tileContext.length > 0
        ? `\nCurrently visible tiles: ${JSON.stringify(this._tileContext)}`
        : '';

    const prompt = `You are an intent classifier for a voice-controlled visualization dashboard.
Analyze the user's speech and extract structured intents.

User said: "${text.replace(/"/g, '\"').replace(/\n/g, ' ')}"${contextStr}

Classify into one or more intents. Valid types:
- WEATHER: User wants weather info. Extract location.
- PLACE: User wants info about a place/landmark/building. Extract the place name.
- FACT: User wants to learn about a concept/topic. Extract the topic.
- BRAINSTORM: User wants ideas/suggestions. Extract the topic.

If the speech doesn't match any intent clearly, return an empty array.
If it references an existing tile (e.g., "what about tomorrow" when a weather tile is showing), include the context.

Respond ONLY with valid JSON, no markdown:
{"intents": [{"type": "WEATHER|PLACE|FACT|BRAINSTORM", "query": "original user query", "params": {"location": "...", "topic": "...", "place": "..."}}]}`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const responseText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    try {
      const parsed = JSON.parse(responseText);
      return parsed.intents || [];
    } catch {
      console.warn('Failed to parse Gemini response:', responseText);
      return [];
    }
  }
}
