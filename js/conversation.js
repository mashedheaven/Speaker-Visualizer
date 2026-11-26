/**
 * conversation.js - Multi-Turn Conversational Memory & Context Manager
 * Maintains context window, resolves follow-up queries & pronoun references,
 * and handles direct HUD commands ('status report', 'clear display', 'explain this').
 */

import { EventEmitter } from './utils.js';

export class ConversationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxHistory = options.maxHistory || 10;
    this.history = []; // [{ role: 'user'|'assistant', text, intent, timestamp }]
    this.lastContext = null; // { type, topic, location, tileId }
  }

  addTurn(role, text, metadata = {}) {
    const turn = {
      role,
      text: text.trim(),
      metadata,
      timestamp: Date.now()
    };
    this.history.push(turn);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (metadata.topic || metadata.location || metadata.type) {
      this.lastContext = {
        type: metadata.type || this.lastContext?.type,
        topic: metadata.topic || this.lastContext?.topic,
        location: metadata.location || this.lastContext?.location,
        tileId: metadata.tileId || this.lastContext?.tileId
      };
    }

    this.emit('turnAdded', turn);
  }

  /**
   * Check if user statement is a direct HUD control command
   * (e.g., 'clear screen', 'system status', 'minimize', etc.)
   */
  checkDirectCommand(text) {
    const clean = text.toLowerCase().trim();

    if (/^(clear|wipe|clean)(\s+all)?\s+(display|screen|tiles|hud)/i.test(clean) || clean === 'clear' || clean === 'clear screen') {
      return { action: 'clear_tiles' };
    }

    if (/^status\s+report$/i.test(clean) || clean === 'hud status') {
      return { action: 'status_report' };
    }

    if (/^what\s+is\s+this/i.test(clean) || clean === 'explain this' || clean === 'what am i looking at') {
      return { action: 'explain_current' };
    }

    if (/^close\s+(tile|card|window)/i.test(clean)) {
      return { action: 'close_active' };
    }

    return null;
  }

  /**
   * Produce a rich context string for the Gemini intent classifier
   */
  getClassifierContext(visibleTiles = []) {
    const recent = this.history.slice(-4).map(h => `${h.role === 'user' ? 'User' : 'JARVIS'}: "${h.text}"`).join('\n');
    return {
      recentDialogue: recent,
      lastEntity: this.lastContext,
      visibleTiles: visibleTiles.map(t => ({
        id: t.id,
        type: t.type,
        title: t.title,
        status: t.status
      }))
    };
  }

  clear() {
    this.history = [];
    this.lastContext = null;
  }
}
