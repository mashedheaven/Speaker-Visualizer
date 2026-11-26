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
    this._convContext = null; // multi-turn conversation context

    // Wait 1.5 s after the last final transcript before calling the LLM
    this._analyze = debounce(this._doAnalyze.bind(this), 1500);
  }

  /**
   * Set conversation dialogue history and last entity context
   */
  setConversationContext(context) {
    this._convContext = context;
  }

  /**
   * Append a final transcript segment.  The debounced analysis will
   * fire once the user stops speaking for 1.5 s, unless `immediate` is true.
   * @param {string} text
   * @param {boolean} [immediate=false]
   */
  addTranscript(text, immediate = false) {
    if (!text.trim()) return;
    this._buffer += ' ' + text.trim();
    // Cap buffer to prevent unbounded growth during continuous speech
    if (this._buffer.length > 500) {
      this._buffer = this._buffer.slice(-500);
    }
    this._analyze();
    if (immediate) {
      this._analyze.flush();
    }
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
      this.emit('processing', false);
      return;
    }

    // ── API key check (with deterministic local offline routing for utility skills) ──
    const keys = getApiKeys();
    if (!keys.gemini) {
      const localIntents = this._fallbackLocalIntent(text);
      if (localIntents.length > 0) {
        this._cache.set(cacheKey, localIntents);
        localIntents.forEach(intent => this.emit('intent', intent));
        this.emit('processing', false);
        return;
      }
      this.emit('processing', false);
      this.emit('error', 'Gemini API key required for open-ended queries & voice STT. Add it in Settings.');
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
    const dialogueStr = this._convContext?.recentDialogue
      ? `\nRecent conversation:\n${this._convContext.recentDialogue}`
      : '';
    const lastEntityStr = this._convContext?.lastEntity
      ? `\nLast referenced context: ${JSON.stringify(this._convContext.lastEntity)}`
      : '';

    const prompt = `You are JARVIS, an intelligent AI intent classifier for a holographic visualization dashboard.
Analyze the user's speech and extract structured intents, resolving follow-up queries or pronouns using the recent conversation.

User said: "${text.replace(/"/g, '\"').replace(/\n/g, ' ')}"${contextStr}${dialogueStr}${lastEntityStr}

Classify into one or more intents. Valid types:
- WEATHER: User wants weather info. Extract location. If follow-up (e.g. "what about tomorrow"), preserve previous location!
- PLACE: User wants info about a place/landmark/building. Extract the place name.
- FACT: User wants to learn about a concept/topic. Extract the topic.
- BRAINSTORM: User wants ideas/suggestions. Extract the topic.
- TIMER: User wants a timer or countdown (e.g. "timer for 5 minutes", "10 second countdown"). Extract duration in seconds as integer "seconds" (e.g. 300 for 5m) and optional "label".
- SYSTEM: User wants hardware or system diagnostics (e.g. "system status", "battery", "CPU usage", "hardware telemetry").
- FINANCE: User wants market, stock, or crypto prices (e.g. "Bitcoin price", "how is Apple stock", "Ethereum", "Tesla"). Extract "asset".
- NEWS: User wants headlines or current events (e.g. "latest news", "tech news", "headlines"). Extract "topic".
- CALCULATOR: User wants mathematical computation, percentages, or conversions (e.g. "calculate 42 * 1337", "what is 15 percent of 250", "sqrt of 144"). Extract "expression".
- MUSIC: User wants to play or search for music/songs/artists (e.g. "play AC/DC", "listen to Back in Black", "play rock"). Extract "track".
- CALENDAR: User asks for agenda, daily schedule, meetings, or briefings (e.g. "what is on my schedule today", "show calendar", "today's agenda").
- SEARCH: User wants to search the global web or lookup information (e.g. "search the web for James Webb telescope", "lookup artificial general intelligence"). Extract "query".
- IMAGE: User wants pictures, photos, or visual gallery of something (e.g. "show me pictures of Mars", "photos of Iron Man armor"). Extract "query".

If the speech doesn't match any intent clearly, return an empty array.
If it is a follow-up or references previous context or existing tiles, resolve the missing parameters using that context.

Respond ONLY with valid JSON, no markdown:
{"intents": [{"type": "WEATHER|PLACE|FACT|BRAINSTORM|TIMER|SYSTEM|FINANCE|NEWS|CALCULATOR|MUSIC|CALENDAR|SEARCH|IMAGE", "query": "original user query", "params": {"location": "...", "topic": "...", "place": "...", "seconds": 60, "asset": "...", "expression": "...", "track": "...", "query": "..."}}]}`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 384,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const responseText = rawText.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

    try {
      const parsed = JSON.parse(responseText);
      return Array.isArray(parsed.intents) ? parsed.intents : [];
    } catch {
      console.warn('Failed to parse Gemini response:', rawText);
      return [];
    }
  }

  /**
   * Deterministic offline/no-key intent classifier so utility and REST-backed skills
   * work immediately on first launch before configuring a Gemini API key.
   * @private
   */
  _fallbackLocalIntent(text) {
    const q = text.trim();
    const lower = q.toLowerCase();

    if (/\b(?:timer|countdown|alarm)\b/i.test(lower)) {
      return [{ type: 'TIMER', query: q, params: { duration: q } }];
    }
    if (/\b(?:system|diagnostics|hardware|battery|cpu|memory)\b/i.test(lower)) {
      return [{ type: 'SYSTEM', query: q, params: {} }];
    }
    if (/\b(?:schedule|calendar|agenda|briefings?|meetings?)\b/i.test(lower)) {
      return [{ type: 'CALENDAR', query: q, params: {} }];
    }
    if (/\b(?:bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|cardano|ada|xrp|ripple|apple|aapl|tesla|tsla|google|googl|nvidia|nvda|microsoft|msft|amazon|amzn|stark|price|stock)\b/i.test(lower)) {
      return [{ type: 'FINANCE', query: q, params: { asset: q } }];
    }
    if (/\b(?:calculate|compute|solve|sqrt|square root|percent)\b/i.test(lower) || /^\s*-?\d+(?:\.\d+)?\s*[+\-*/^%×÷]\s*-?\d+/.test(lower)) {
      return [{ type: 'CALCULATOR', query: q, params: { expression: q } }];
    }
    if (/\b(?:play|listen to|music|song|track)\b/i.test(lower)) {
      return [{ type: 'MUSIC', query: q, params: { track: q } }];
    }
    if (/\b(?:pictures? of|photos? of|images? of|pics? of|visual gallery)\b/i.test(lower)) {
      return [{ type: 'IMAGE', query: q, params: { query: q } }];
    }
    if (/\b(?:search|lookup|google)\b/i.test(lower)) {
      return [{ type: 'SEARCH', query: q, params: { query: q } }];
    }
    if (/\b(?:news|headlines|updates)\b/i.test(lower)) {
      return [{ type: 'NEWS', query: q, params: { topic: q } }];
    }
    const placeMatch = q.match(/\b(?:tell me about|where is|information on|info about)\s+(?:the\s+)?(.+)$/i);
    if (placeMatch) {
      return [{ type: 'PLACE', query: q, params: { place: placeMatch[1].replace(/[?.!]+$/, '').trim() } }];
    }
    return [];
  }
}
