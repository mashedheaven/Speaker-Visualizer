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

// ──────────────────────────────────────────────
// Settings Management (cached in memory)
// ──────────────────────────────────────────────

/**
 * In-memory settings cache. Loaded once at startup from Electron's
 * file-based store (async), then kept in sync on every save.
 * All reads are synchronous from cache — no IPC blocking.
 */
let _settingsCache = {};

/**
 * Initialize settings from Electron's file store.
 * Must be called once at app startup (awaited).
 */
export async function initSettings() {
  try {
    if (window.electronAPI && window.electronAPI.loadSettings) {
      const keys = await window.electronAPI.loadSettings();
      if (keys) {
        _settingsCache = keys;
        return;
      }
    }
    // Fallback to localStorage
    _settingsCache = JSON.parse(localStorage.getItem('speaker-viz-keys') || '{}') || {};
  } catch {
    _settingsCache = {};
  }
}

/**
 * Retrieve stored API keys synchronously from the in-memory cache.
 */
export function getApiKeys() {
  return { ..._settingsCache };
}

/**
 * Persist API keys to Electron file system and update the cache.
 */
export async function setApiKeys(keys) {
  _settingsCache = { ...keys };
  if (window.electronAPI && window.electronAPI.saveSettings) {
    await window.electronAPI.saveSettings(keys);
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
 *   1. Numbered list item
 *   *italic text*
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

  let currentList = null; // <ul> or <ol> being built
  let listType = null;    // 'ul' or 'ol'
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
      listType = null;
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

    // --- Bullet list (- item or * item) ---
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType !== 'ul') { flushList(); currentList = document.createElement('ul'); listType = 'ul'; }
      const li = document.createElement('li');
      _applyInlineFormatting(li, bulletMatch[1]);
      currentList.appendChild(li);
      continue;
    }

    // --- Numbered list (1. item) ---
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      if (listType !== 'ol') { flushList(); currentList = document.createElement('ol'); listType = 'ol'; }
      const li = document.createElement('li');
      _applyInlineFormatting(li, numberedMatch[1]);
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
 * Parse inline formatting (**bold**, `code`, *italic*) and append child
 * nodes to the given `parent` element.
 *
 * @param {HTMLElement} parent
 * @param {string} text
 */
function _applyInlineFormatting(parent, text) {
  // Regex alternation to find bold, code, or italic spans
  const inlineRe = /(\*\*(.+?)\*\*|`([^`]+?)`|\*([^*]+?)\*)/g;

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
    } else if (match[4] !== undefined) {
      // *italic*
      const em = document.createElement('em');
      em.textContent = match[4];
      parent.appendChild(em);
    }

    lastIndex = inlineRe.lastIndex;
  }

  // Remaining text after the last match
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
