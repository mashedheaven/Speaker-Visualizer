import { SpeechEngine, AudioAnalyzer } from './speech.js';
import { IntentDetector } from './intent.js';
import { TileManager } from './tileManager.js';
import { TileRenderer } from './renderer.js';
import { SettingsPanel } from './settings.js';
import { WeatherSkill } from './skills/weather.js';
import { PlaceInfoSkill } from './skills/placeInfo.js';
import { GeneralFactSkill } from './skills/generalFact.js';
import { BrainstormSkill } from './skills/brainstorm.js';
import { getApiKeys, initSettings } from './utils.js';

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
    this.menuBtn = document.getElementById('menu-btn');
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
    this._silenceTimer = null;
    
    this._bindEvents();
    this._checkInitialState();
  }
  
  _bindEvents() {
    // Mic button
    this.micBtn?.addEventListener('click', () => this._toggleListening());
    
    // Settings button
    this.settingsBtn?.addEventListener('click', () => this.settings.open());

    // Hamburger menu (mobile sidebar toggle)
    this.menuBtn?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('sidebar--open');
    });

    // Setup prompt button (replace inline onclick)
    document.getElementById('setup-open-settings')?.addEventListener('click', () => {
      this.settings.open();
    });
    
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
      
      // Cmd+Shift+V (or Ctrl+Shift+V) local shortcut
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') {
        e.preventDefault();
        this._toggleListening();
      }
    });

    // Skill guide buttons
    document.querySelectorAll('.sidebar__item[data-skill]').forEach(el => {
      el.addEventListener('click', () => {
        const skillName = el.getAttribute('data-skill');
        this._showSkillGuide(skillName);
        
        // On mobile, close sidebar after clicking
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('sidebar--open')) {
          sidebar.classList.remove('sidebar--open');
        }
      });
    });

    // Electron IPC shortcut toggle (now actually wired up from main.js)
    if (window.electronAPI) {
      window.electronAPI.onToggleListen(() => {
        this._toggleListening();
      });
    }
  }
  
  async _toggleListening() {
    if (this.speech.state === 'listening') {
      this.speech.stop();
      this.audioAnalyzer.stop();
      this._stopWaveform();
    } else {
      // Check for API keys first
      if (!this.settings.hasRequiredKeys()) {
        this._showNotification('Please set your API key in Settings first.', 'warning');
        this.settings.open();
        return;
      }
      
      if (!SpeechEngine.isSupported()) {
        this._showNotification('MediaRecorder is not supported.', 'error');
        return;
      }
      
      // Start speech engine (it gets its own mic stream)
      await this.speech.start();
      
      // Share the speech engine's stream with AudioAnalyzer (single mic request!)
      const sharedStream = this.speech.getStream();
      if (sharedStream) {
        try {
          await this.audioAnalyzer.start(sharedStream);
        } catch (err) {
          console.error('AudioAnalyzer start failed:', err);
        }
        this._startWaveform();
      }
    }
  }
  
  _startWaveform() {
    const container = document.querySelector('.app-container');
    
    const render = () => {
      this.audioAnalyzer.renderWaveform(this.waveformCanvas);
      
      // Control background animation based on voice activity
      const data = this.audioAnalyzer.getFrequencyData();
      if (data && container) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        
        if (avg > 8) {
          container.style.animationPlayState = 'running';
          clearTimeout(this._silenceTimer);
          this._silenceTimer = setTimeout(() => {
            if (container) container.style.animationPlayState = 'paused';
            
            // Silence detected: user finished speaking, flush transcription
            if (this.speech && this.speech.state === 'listening') {
              this.speech.flushAndTranscribe();
            }
          }, 1200);
        }
      }
      
      this._waveformAnimId = requestAnimationFrame(render);
    };
    render();
  }
  
  _stopWaveform() {
    if (this._waveformAnimId) {
      cancelAnimationFrame(this._waveformAnimId);
      this._waveformAnimId = null;
    }
    // Clear the silence timer to prevent stale callbacks
    clearTimeout(this._silenceTimer);
    this._silenceTimer = null;

    // Clear canvas
    const ctx = this.waveformCanvas?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    
    // Ensure animation stops
    const container = document.querySelector('.app-container');
    if (container) container.style.animationPlayState = 'paused';
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
    const hasKeys = !!(keys.gemini || keys.openai);
    
    // Show setup prompt if no keys
    const setupPrompt = document.getElementById('setup-prompt');
    if (setupPrompt) {
      setupPrompt.style.display = hasKeys ? 'none' : 'flex';
    }
  }

  _showSkillGuide(skillName) {
    const guides = {
      'weather': { 
        title: '🌤️ How to use Weather', 
        content: 'Get real-time weather and forecasts for any location.\n\n**Try saying:**\n- "What is the weather like in Tokyo?"\n- "Is it going to rain in London today?"\n- "Weather in New York"' 
      },
      'place': { 
        title: '🏛️ How to use Places', 
        content: 'Discover facts, history, and photos of famous landmarks and cities.\n\n**Try saying:**\n- "Tell me about the Eiffel Tower"\n- "Where is the Golden Gate Bridge?"\n- "Information on Mount Everest"' 
      },
      'fact': { 
        title: '📚 How to use Facts', 
        content: 'Ask general knowledge questions and get detailed, easy-to-understand explanations.\n\n**Try saying:**\n- "Explain quantum physics to me"\n- "Why is the sky blue?"\n- "How do black holes work?"' 
      },
      'brainstorm': { 
        title: '💡 How to use Brainstorm', 
        content: 'Generate creative ideas for projects, writing, or problem-solving.\n\n**Try saying:**\n- "Give me 3 ideas for a sci-fi novel"\n- "Brainstorm marketing strategies for a coffee shop"\n- "What should I cook for dinner with chicken and rice?"' 
      }
    };
    
    const guide = guides[skillName];
    if (!guide) return;
    
    // Create a tile using the 'fact' template which gracefully renders markdown
    const tile = this.tileManager.addTile('fact', guide.title);
    this.tileManager.updateTile(tile.id, { 
      status: 'ready', 
      data: { content: guide.content } 
    });
  }
  
  _showNotification(message, type = 'info') {
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

// Initialize on DOM ready — load settings async first, then boot app
document.addEventListener('DOMContentLoaded', async () => {
  await initSettings();
  window.app = new App();
});
