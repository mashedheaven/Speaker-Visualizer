// ──────────────────────────────────────────────
// utils.js – Shared utilities for Speaker Visualizer
// ──────────────────────────────────────────────

/**
 * Lightweight publish / subscribe event emitter.
 */
export class EventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, cb) {
    (this._events[event] ??= []).push(cb);
    return this;
  }

  off(event, cb) {
    this._events[event] = (this._events[event] || []).filter(f => f !== cb);
    return this;
  }

  emit(event, ...args) {
    (this._events[event] || []).forEach(cb => cb(...args));
  }
}

/**
 * Debounce – delays invoking `fn` until `ms` milliseconds have elapsed
 * since the last call.  Critical for batching transcript chunks before
 * sending them to the LLM.
 */
export function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  };
}

/**
 * Throttle – ensures `fn` is called at most once every `ms` milliseconds.
 * Uses a leading-edge call + trailing-edge flush so the last invocation
 * is never lost.
 */
export function throttle(fn, ms) {
  let lastCall = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = ms - (now - lastCall);

    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      lastCall = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Simple in-memory key → value cache with per-entry TTL.
 */
export class Cache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this._ttl = ttlMs;
    this._store = new Map();
  }

  /** Returns the cached value or `null` if missing / expired. */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + this._ttl,
    });
  }

  has(key) {
    return this.get(key) !== null;
  }
}

/**
 * Generate a unique identifier.
 * Prefers `crypto.randomUUID()` with a fallback for older environments.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: pseudo-random hex string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert a temperature from Kelvin to Celsius or Fahrenheit.
 * @param {number} kelvin
 * @param {'C'|'F'} unit
 * @returns {string} Formatted temperature string with unit symbol.
 */
export function formatTemp(kelvin, unit = 'C') {
  if (unit === 'F') {
    return `${((kelvin - 273.15) * 9 / 5 + 32).toFixed(1)}°F`;
  }
  return `${(kelvin - 273.15).toFixed(1)}°C`;
}

/**
 * Escape HTML special characters to prevent XSS when building
 * strings that will be placed into the DOM.
 */
export function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, ch => map[ch]);
}

/**
 * Retrieve stored API keys from localStorage or Electron file system.
 */
export function getApiKeys() {
  try {
    if (window.electronAPI && window.electronAPI.loadSettings) {
      const keys = window.electronAPI.loadSettings();
      if (keys) return keys;
    }
    return JSON.parse(localStorage.getItem('speaker-viz-keys') || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Persist API keys to localStorage and Electron file system.
 */
export function setApiKeys(keys) {
  if (window.electronAPI && window.electronAPI.saveSettings) {
    window.electronAPI.saveSettings(keys);
  }
  localStorage.setItem('speaker-viz-keys', JSON.stringify(keys));
}

// ──────────────────────────────────────────────
// Markdown-like renderer (secure – no innerHTML)
// ──────────────────────────────────────────────

/**
 * Convert simple markdown-like text into a DocumentFragment.
 *
 * Supported syntax:
 *   **bold text**
 *   `inline code`
 *   ### Heading
 *   - Bullet item
 *   Plain paragraphs (separated by blank lines)
 *
 * Uses only `document.createElement` / `document.createTextNode` – never
 * `innerHTML` – to avoid XSS.
 *
 * @param {string} text  Raw markdown-ish text.
 * @returns {DocumentFragment}
 */
export function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');

  let currentList = null; // <ul> being built (if inside a bullet run)
  let paragraphBuffer = []; // plain-text lines waiting to become a <p>

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const p = document.createElement('p');
    _applyInlineFormatting(p, paragraphBuffer.join(' '));
    fragment.appendChild(p);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (currentList) {
      fragment.appendChild(currentList);
      currentList = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // --- Blank line → flush everything ---
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    // --- Headings (### heading) ---
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      const h = document.createElement(`h${level}`);
      _applyInlineFormatting(h, headingMatch[2]);
      fragment.appendChild(h);
      continue;
    }

    // --- Bullet list (- item) ---
    const bulletMatch = line.match(/^\s*-\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!currentList) currentList = document.createElement('ul');
      const li = document.createElement('li');
      _applyInlineFormatting(li, bulletMatch[1]);
      currentList.appendChild(li);
      continue;
    }

    // --- Plain text → accumulate for <p> ---
    flushList();
    paragraphBuffer.push(line);
  }

  // Flush any remaining content
  flushParagraph();
  flushList();

  return fragment;
}

/**
 * Parse inline formatting (**bold**, `code`) and append child nodes to
 * the given `parent` element.  Uses a simple state-machine tokenizer
 * rather than innerHTML.
 *
 * @param {HTMLElement} parent
 * @param {string} text
 */
function _applyInlineFormatting(parent, text) {
  // Regex alternation to find bold or code spans
  const inlineRe = /(\*\*(.+?)\*\*|`([^`]+?)`)/g;

  let lastIndex = 0;
  let match;

  while ((match = inlineRe.exec(text)) !== null) {
    // Text before this match → plain text node
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[2] !== undefined) {
      // **bold**
      const strong = document.createElement('strong');
      strong.textContent = match[2];
      parent.appendChild(strong);
    } else if (match[3] !== undefined) {
      // `code`
      const code = document.createElement('code');
      code.textContent = match[3];
      parent.appendChild(code);
    }

    lastIndex = inlineRe.lastIndex;
  }

  // Remaining text after the last match
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  // Edge case: completely plain text (no matches at all)
  if (lastIndex === 0 && text.length > 0) {
    // Already appended above via the "remaining text" branch
  }
}
