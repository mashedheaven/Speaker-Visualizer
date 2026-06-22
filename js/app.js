import { SpeechEngine, AudioAnalyzer } from './speech.js';
import { IntentDetector } from './intent.js';
import { TileManager } from './tileManager.js';
import { TileRenderer } from './renderer.js';
import { SettingsPanel } from './settings.js';
import { WeatherSkill } from './skills/weather.js';
import { PlaceInfoSkill } from './skills/placeInfo.js';
import { GeneralFactSkill } from './skills/generalFact.js';
import { BrainstormSkill } from './skills/brainstorm.js';
import { getApiKeys } from './utils.js';

class App {
  constructor() {
    // Core modules
    this.speech = new SpeechEngine();
    this.audioAnalyzer = new AudioAnalyzer();
    this.intentDetector = new IntentDetector();
    this.tileManager = new TileManager();
    this.settings = new SettingsPanel();
    
    // Skills registry
    this.skills = [WeatherSkill, PlaceInfoSkill, GeneralFactSkill, BrainstormSkill];
    
    // DOM references
    this.micBtn = document.getElementById('mic-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.transcriptText = document.getElementById('transcript-text');
    this.waveformCanvas = document.getElementById('waveform-canvas');
    this.mainGrid = document.getElementById('main-grid');
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');
    this.clearBtn = document.getElementById('clear-btn');
    this.historyList = document.getElementById('history-list');
    
    // Initialize renderer
    this.renderer = new TileRenderer(this.mainGrid, this.tileManager);
    
    // Waveform animation frame reference
    this._waveformAnimId = null;
    
    this._bindEvents();
    this._checkInitialState();
  }
  
  _bindEvents() {
    // Mic button
    this.micBtn?.addEventListener('click', () => this._toggleListening());
    
    // Settings button
    this.settingsBtn?.addEventListener('click', () => this.settings.open());
    
    // Clear button
    this.clearBtn?.addEventListener('click', () => this.tileManager.clearUnpinned());
    
    // Speech events
    this.speech.on('interim', text => {
      this._updateTranscript(text, true);
    });
    
    this.speech.on('final', text => {
      this._updateTranscript(text, false);
      this.intentDetector.addTranscript(text);
      this._addToHistory(text);
    });
    
    this.speech.on('stateChange', state => {
      this._updateMicState(state);
    });
    
    this.speech.on('error', err => {
      console.error('Speech error:', err);
      this._showNotification(err, 'error');
    });

    this.speech.on('warning', msg => {
      console.warn('Speech warning:', msg);
      this._showNotification(msg, 'warning');
    });
    
    // Intent events
    this.intentDetector.on('intent', intent => {
      this._handleIntent(intent);
    });
    
    this.intentDetector.on('processing', isProcessing => {
      this.statusText.textContent = isProcessing ? 'Analyzing...' : 
        (this.speech.state === 'listening' ? 'Listening' : 'Ready');
    });
    
    this.intentDetector.on('error', err => {
      this._showNotification(err, 'error');
    });
    
    // Tile context updates for intent detector
    this.tileManager.on('tilesChanged', () => {
      this.intentDetector.setTileContext(this.tileManager.getContext());
    });
    
    // Settings changes
    window.addEventListener('settings-changed', () => {
      this._checkInitialState();
    });
    
    // Keyboard shortcut (Space to toggle mic when not in an input)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        this._toggleListening();
      }
    });
  }
  
  async _toggleListening() {
    if (this.speech.state === 'listening') {
      this.speech.stop();
      this.audioAnalyzer.stop();
      this._stopWaveform();
    } else {
      // Check for API keys first
      if (!this.settings.hasRequiredKeys()) {
        this._showNotification('Please set your Gemini API key in Settings first.', 'warning');
        this.settings.open();
        return;
      }
      
      if (!SpeechEngine.isSupported()) {
        this._showNotification('Speech recognition is not supported in this browser. Please use Chrome.', 'error');
        return;
      }
      
      this.speech.start();
      await this.audioAnalyzer.start();
      this._startWaveform();
    }
  }
  
  _startWaveform() {
    const render = () => {
      this.audioAnalyzer.renderWaveform(this.waveformCanvas);
      this._waveformAnimId = requestAnimationFrame(render);
    };
    render();
  }
  
  _stopWaveform() {
    if (this._waveformAnimId) {
      cancelAnimationFrame(this._waveformAnimId);
      this._waveformAnimId = null;
    }
    // Clear canvas
    const ctx = this.waveformCanvas?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
  }
  
  _updateTranscript(text, isInterim) {
    if (!this.transcriptText) return;
    this.transcriptText.textContent = text;
    this.transcriptText.className = isInterim 
      ? 'transcript__text transcript__text--interim' 
      : 'transcript__text transcript__text--final';
  }
  
  _updateMicState(state) {
    this.micBtn?.classList.toggle('mic-btn--active', state === 'listening');
    
    // Status indicator
    if (this.statusDot) {
      this.statusDot.className = 'status-dot' + 
        (state === 'listening' ? ' status-dot--active' : 
         state === 'error' ? ' status-dot--error' : ' status-dot--inactive');
    }
    if (this.statusText) {
      this.statusText.textContent = state === 'listening' ? 'Listening' : 
        state === 'error' ? 'Error' : 'Ready';
    }
  }
  
  async _handleIntent(intent) {
    // Find matching skill
    const skill = this.skills.find(s => s.match(intent));
    if (!skill) {
      console.warn('No skill matched intent:', intent);
      return;
    }
    
    // Create tile immediately in loading state
    const title = this._formatTileTitle(intent);
    const tile = this.tileManager.addTile(skill.name, title);
    
    // Execute skill asynchronously
    try {
      const data = await skill.execute(intent);
      this.tileManager.updateTile(tile.id, { status: 'ready', data });
    } catch (err) {
      this.tileManager.updateTile(tile.id, { status: 'error', error: err.message });
    }
  }
  
  _formatTileTitle(intent) {
    switch (intent.type) {
      case 'WEATHER': return `Weather in ${intent.params?.location || intent.query}`;
      case 'PLACE': return intent.params?.place || intent.query;
      case 'FACT': return intent.params?.topic || intent.query;
      case 'BRAINSTORM': return `Ideas: ${intent.params?.topic || intent.query}`;
      default: return intent.query;
    }
  }
  
  _addToHistory(text) {
    if (!this.historyList || !text.trim()) return;
    const item = document.createElement('div');
    item.className = 'sidebar__item';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'sidebar__item-time';
    timeSpan.textContent = time;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'sidebar__item-text';
    textSpan.textContent = text.length > 40 ? text.substring(0, 40) + '...' : text;
    
    item.append(timeSpan, textSpan);
    this.historyList.prepend(item);
    // Keep max 20 history items
    while (this.historyList.children.length > 20) {
      this.historyList.removeChild(this.historyList.lastChild);
    }
  }
  
  _checkInitialState() {
    const keys = getApiKeys();
    const hasKeys = !!(keys.gemini);
    
    // Show setup prompt if no keys
    const setupPrompt = document.getElementById('setup-prompt');
    if (setupPrompt) {
      setupPrompt.style.display = hasKeys ? 'none' : 'flex';
    }
  }
  
  _showNotification(message, type = 'info') {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.style.cssText = `
      position: fixed; bottom: calc(var(--transcript-height) + var(--space-4)); right: var(--space-4);
      padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
      background: var(--bg-elevated); border: 1px solid var(--glass-border);
      color: var(--text-primary); font-size: var(--text-sm);
      z-index: var(--z-tooltip); animation: slideUp var(--duration-enter) var(--ease-out);
      max-width: 360px; backdrop-filter: blur(10px);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all var(--duration-normal) var(--ease-out)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
