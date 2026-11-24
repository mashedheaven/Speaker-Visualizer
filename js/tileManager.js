// ──────────────────────────────────────────────
// tileManager.js – Manage the lifecycle and
//                  state of visualisation tiles
// ──────────────────────────────────────────────

import { EventEmitter, generateId } from './utils.js';

/**
 * @typedef {Object} TileData
 * @property {string}  id
 * @property {string}  type       – 'weather' | 'place' | 'fact' | 'brainstorm'
 * @property {string}  title
 * @property {'loading'|'ready'|'error'} status
 * @property {boolean} pinned
 * @property {boolean} expanded
 * @property {number}  createdAt  – Date.now() timestamp
 * @property {*}       data       – Skill-specific payload (set when ready)
 * @property {string|null} error  – Error message (set when status === 'error')
 */

/**
 * Maintains an ordered collection of tiles, emitting fine-grained
 * events so the renderer can react to each mutation.
 *
 * Events:
 *   'tileAdded'    → (tile: TileData)
 *   'tileUpdated'  → (tile: TileData)
 *   'tileRemoved'  → (tileId: string)
 *   'tilesChanged' → (tiles: TileData[])
 */
export class TileManager extends EventEmitter {
  /**
   * @param {number} maxTiles  Maximum number of tiles before eviction.
   */
  constructor(maxTiles = 12) {
    super();
    /** @type {TileData[]} */
    this.tiles = [];
    this.maxTiles = maxTiles;
    this._storageKey = 'sv_persisted_tiles';

    // Auto-save whenever tiles mutate
    this.on('tilesChanged', () => this._saveToStorage());
  }

  /**
   * Load saved tiles from storage (survives app restart)
   */
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Load in reverse order so unshift restores exact order
        parsed.reverse().forEach(saved => {
          if (saved && saved.id && saved.status === 'ready') {
            this.tiles.unshift(saved);
            this.emit('tileAdded', saved);
          }
        });
        if (this.tiles.length > 0) {
          this.emit('tilesChanged', this.tiles);
        }
      }
    } catch (e) {
      console.warn('Failed to restore persisted tiles:', e);
    }
  }

  _saveToStorage() {
    try {
      // Save ready tiles (max 12), preserving pinned status
      const toSave = this.tiles
        .filter(t => t.status === 'ready' && t.type !== 'timer') // exclude transient countdowns
        .map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          status: t.status,
          pinned: t.pinned,
          expanded: false,
          createdAt: t.createdAt,
          data: t.data,
          error: null
        }));
      localStorage.setItem(this._storageKey, JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save tiles to storage:', e);
    }
  }

  /**
   * Create a new tile in the `'loading'` state and prepend it to the
   * list (newest first).  If the tile cap is reached, the oldest
   * unpinned tile is evicted.
   *
   * @param {string} type  – Tile type (e.g. 'weather').
   * @param {string} title – Human-readable title shown in the UI.
   * @returns {TileData}   The newly created tile.
   */
  addTile(type, title) {
    const tile = {
      id: generateId(),
      type,
      title,
      status: 'loading',
      pinned: false,
      expanded: false,
      createdAt: Date.now(),
      data: null,
      error: null,
    };

    // Evict the oldest unpinned tile when at capacity
    if (this.tiles.length >= this.maxTiles) {
      const unpinned = this.tiles.filter(t => !t.pinned);
      if (unpinned.length > 0) {
        // unpinned list preserves original order (newest-first),
        // so the *last* element is the oldest.
        const oldest = unpinned[unpinned.length - 1];
        this.removeTile(oldest.id);
      }
    }

    // Newest tile at the beginning of the array
    this.tiles.unshift(tile);

    this.emit('tileAdded', tile);
    this.emit('tilesChanged', this.tiles);
    return tile;
  }

  /**
   * Merge partial updates into an existing tile and notify listeners.
   *
   * @param {string} id       – Tile ID.
   * @param {Partial<TileData>} updates – Fields to overwrite.
   */
  updateTile(id, updates) {
    const tile = this.tiles.find(t => t.id === id);
    if (!tile) return;

    Object.assign(tile, updates);
    this.emit('tileUpdated', tile);
    this.emit('tilesChanged', this.tiles);
  }

  /**
   * Remove a tile by ID.
   * @param {string} id
   */
  removeTile(id) {
    const index = this.tiles.findIndex(t => t.id === id);
    if (index === -1) return;

    this.tiles.splice(index, 1);
    this.emit('tileRemoved', id);
    this.emit('tilesChanged', this.tiles);
  }

  /**
   * Toggle the pinned state.  Pinned tiles are protected from eviction.
   * @param {string} id
   */
  togglePin(id) {
    const tile = this.tiles.find(t => t.id === id);
    if (!tile) return;

    tile.pinned = !tile.pinned;
    this.emit('tileUpdated', tile);
    this.emit('tilesChanged', this.tiles);
  }

  /**
   * Toggle the expanded state.  Only one tile can be expanded at a time;
   * expanding a tile automatically collapses any currently-expanded tile.
   * @param {string} id
   */
  toggleExpand(id) {
    const tile = this.tiles.find(t => t.id === id);
    if (!tile) return;

    // Collapse every other expanded tile first
    for (const t of this.tiles) {
      if (t.id !== id && t.expanded) {
        t.expanded = false;
        this.emit('tileUpdated', t);
      }
    }

    tile.expanded = !tile.expanded;
    this.emit('tileUpdated', tile);
  }

  /**
   * Return a shallow copy of the tiles array.
   * @returns {TileData[]}
   */
  getTiles() {
    return [...this.tiles];
  }

  /**
   * Produce a lightweight summary of tiles suitable for feeding into
   * the intent detector as context.
   * @returns {Array<{type: string, title: string}>}
   */
  getContext() {
    return this.tiles.map(t => ({ type: t.type, title: t.title }));
  }

  /**
   * Remove every tile that is not pinned.
   */
  clearUnpinned() {
    const unpinned = this.tiles.filter(t => !t.pinned);
    if (unpinned.length === 0) return;
    unpinned.forEach(t => {
      const index = this.tiles.findIndex(tile => tile.id === t.id);
      if (index !== -1) {
        this.tiles.splice(index, 1);
        this.emit('tileRemoved', t.id);
      }
    });
    this.emit('tilesChanged', this.tiles);
  }
}
