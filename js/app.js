import { SpeechEngine, AudioAnalyzer } from './speech.js';
import { IntentDetector } from './intent.js';
import { TileManager } from './tileManager.js';
import { TileRenderer } from './renderer.js';
import { SettingsPanel } from './settings.js';
import { WeatherSkill } from './skills/weather.js';
import { PlaceInfoSkill } from './skills/placeInfo.js';
import { GeneralFactSkill } from './skills/generalFact.js';
import { BrainstormSkill } from './skills/brainstorm.js';
import { TimerSkill } from './skills/timer.js';
import { SystemSkill } from './skills/system.js';
import { FinanceSkill } from './skills/finance.js';
import { NewsSkill } from './skills/news.js';
import { CalculatorSkill } from './skills/calculator.js';
import { MusicSkill } from './skills/music.js';
import { CalendarSkill } from './skills/calendar.js';
import { WebSearchSkill } from './skills/webSearch.js';
import { ImageSearchSkill } from './skills/imageSearch.js';
import { getApiKeys, initSettings } from './utils.js';
import { ArcReactor } from './arcReactor.js';
import { HudBackground } from './hudBackground.js';
import { JarvisVoice } from './jarvisVoice.js';
import { ConversationManager } from './conversation.js';

class App {
  constructor() {
    // Core modules
    this.speech = new SpeechEngine();
    this.audioAnalyzer = new AudioAnalyzer();
    this.intentDetector = new IntentDetector();
    this.tileManager = new TileManager();
    this.settings = new SettingsPanel();
    this.jarvis = new JarvisVoice();
    this.conversation = new ConversationManager();
    
    // Skills registry
    this.skills = [
      WeatherSkill,
      PlaceInfoSkill,
      GeneralFactSkill,
      BrainstormSkill,
      TimerSkill,
      SystemSkill,
      FinanceSkill,
      NewsSkill,
      CalculatorSkill,
      MusicSkill,
      CalendarSkill,
      WebSearchSkill,
      ImageSearchSkill
    ];
    
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
    
    // Restore persisted tiles & history from previous session
    this.tileManager.loadFromStorage();
    this._loadHistory();

    // Arc Reactor & Ambient HUD Background
    const hudCanvas = document.getElementById('hud-bg-canvas');
    if (hudCanvas) {
      this.hudBg = new HudBackground(hudCanvas);
      this.hudBg.start();
    }
    if (this.waveformCanvas) {
      this.arcReactor = new ArcReactor(this.waveformCanvas);
      this.arcReactor.start();
    }

    // Sync JARVIS voice audio activity directly into Arc Reactor
    this.jarvis.on('voiceData', (audioData) => {
      if (this.arcReactor) {
        this.arcReactor.updateAudioData(audioData);
      }
    });

    this.jarvis.on('start', () => {
      this.arcReactor?.setState('response');
    });

    this.jarvis.on('end', () => {
      if (this.speech.state === 'listening') {
        this.arcReactor?.setState('listening');
      } else {
        this.arcReactor?.setState('idle');
      }
    });

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
    this.clearBtn?.addEventListener('click', () => {
      this.tileManager.clearUnpinned();
      localStorage.removeItem('sv_transcript_history');
      if (this.historyList) this.historyList.innerHTML = '';
      this.jarvis?.playChime('complete');
    });
    
    // Speech events
    this.speech.on('interim', text => {
      this._updateTranscript(text, true);
    });
    
    this.speech.on('final', text => {
      this.processText(text);
    });
    
    this.speech.on('stateChange', state => {
      this._updateMicState(state);
      if (this.arcReactor) {
        this.arcReactor.setState(state === 'listening' ? 'listening' : 'idle');
      }
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
      if (this.arcReactor) {
        if (isProcessing) {
          this.arcReactor.setState('processing');
        } else if (this.speech.state === 'listening') {
          this.arcReactor.setState('listening');
        } else {
          this.arcReactor.setState('idle');
        }
      }
    });
    
    this.intentDetector.on('error', err => {
      this._showNotification(err, 'error');
    });
    
    // Tile context updates for intent detector
    this.tileManager.on('tilesChanged', () => {
      this.intentDetector.setTileContext(this.tileManager.getContext());
    });
    
    // Window resize for HUD background and Arc Reactor canvases
    window.addEventListener('resize', () => {
      this.hudBg?.resize();
      this.arcReactor?.resize();
    });

    // Interactive Empty State Quick Prompts
    document.querySelectorAll('.empty-state__example').forEach(el => {
      el.addEventListener('click', () => {
        const text = el.textContent.replace(/^"|"$/g, '').trim();
        this.processText(text);
      });
    });

    // History and Tile Search filter
    const historySearch = document.getElementById('history-search');
    if (historySearch) {
      historySearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const historyItems = this.historyList?.querySelectorAll('.sidebar__item');
        historyItems?.forEach(item => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(query) ? 'flex' : 'none';
        });

        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tileEl => {
          if (!query) {
            tileEl.style.display = '';
          } else {
            const tileText = tileEl.textContent.toLowerCase();
            tileEl.style.display = tileText.includes(query) ? '' : 'none';
          }
        });
      });
    }

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
      this.jarvis.playChime('deactivate');
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
      this.jarvis.playChime('activate');
      
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
      // Frequency analysis
      const data = this.audioAnalyzer.getFrequencyData();

      // Feed Arc Reactor & Ambient HUD Background
      if (this.arcReactor && data) {
        this.arcReactor.updateAudioData(data);
      }
      if (this.hudBg && data) {
        this.hudBg.updateAudioData(data);
      }
      
      // Control background animation based on voice activity
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

    if (this.arcReactor) {
      this.arcReactor.updateAudioData(null);
      this.arcReactor.setState('idle');
    }
    if (this.hudBg) {
      this.hudBg.updateAudioData(null);
    }
    
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

    // Play subtle holographic affirmative chirp
    this.jarvis.playChime('acknowledge');
    
    // Create tile immediately in loading state
    const title = this._formatTileTitle(intent);
    const tile = this.tileManager.addTile(skill.name, title);
    
    // Execute skill asynchronously
    try {
      const data = await skill.execute(intent);
      this.tileManager.updateTile(tile.id, { status: 'ready', data });
      this.arcReactor?.setState('response');
      this.jarvis.playChime('complete');

      // JARVIS synthesizes executive vocal response
      const spokenSummary = this.jarvis.summarizeTileForSpeech(skill.name, data, tile.title);
      this.jarvis.speak(spokenSummary);
      this._updateTranscript(`JARVIS: "${spokenSummary}"`, false);

      // Record in conversation manager
      this.conversation.addTurn('assistant', spokenSummary, {
        type: skill.name,
        topic: tile.title,
        tileId: tile.id
      });
      this._syncConversationContext();

      setTimeout(() => {
        if (!this.jarvis.isSpeaking) {
          if (this.speech.state === 'listening') {
            this.arcReactor?.setState('listening');
          } else {
            this.arcReactor?.setState('idle');
          }
        }
      }, 1600);
    } catch (err) {
      this.tileManager.updateTile(tile.id, { status: 'error', error: err.message });
      this.jarvis.playChime('error');
      this.jarvis.speak("Pardon me, sir. I encountered an error retrieving that telemetry.");
    }
  }

  _syncConversationContext() {
    this.intentDetector.setConversationContext(
      this.conversation.getClassifierContext(this.tileManager.getTiles())
    );
  }

  _executeDirectCommand(cmd, userText) {
    this.conversation.addTurn('user', userText);

    if (cmd.action === 'clear_tiles') {
      this.tileManager.clearUnpinned();
      this.jarvis.playChime('complete');
      const msg = "Holographic display cleared, sir.";
      this.jarvis.speak(msg);
      this._updateTranscript(`JARVIS: "${msg}"`, false);
      this.conversation.addTurn('assistant', msg);
    } else if (cmd.action === 'status_report') {
      this.jarvis.playChime('complete');
      const count = this.tileManager.getTiles().length;
      const msg = `All systems nominal, sir. Arc Reactor online, displaying ${count} active telemetry modules.`;
      this.jarvis.speak(msg);
      this._updateTranscript(`JARVIS: "${msg}"`, false);
      this.conversation.addTurn('assistant', msg);
    } else if (cmd.action === 'explain_current') {
      const tiles = this.tileManager.getTiles();
      if (tiles.length === 0) {
        const msg = "The holographic display is currently clear, sir. You can request weather, places, facts, or brainstorming.";
        this.jarvis.speak(msg);
        this._updateTranscript(`JARVIS: "${msg}"`, false);
      } else {
        const topTile = tiles[0];
        const msg = this.jarvis.summarizeTileForSpeech(topTile.type, topTile.data, topTile.title);
        this.jarvis.speak(msg);
        this._updateTranscript(`JARVIS: "${msg}"`, false);
      }
    }
  }
  
  processText(text) {
    if (!text || !text.trim()) return;
    this._updateTranscript(text, false);
    this._addToHistory(text);

    // Wake word check ('Jarvis', 'Hey Jarvis', etc.)
    const { detected, cleanText, isWakeOnly } = this.jarvis.detectWakeWord(text);

    if (detected) {
      this.jarvis.playChime('activate');
      if (isWakeOnly) {
        const greeting = this.jarvis.getGreeting();
        this.jarvis.speak(greeting);
        this._updateTranscript(`JARVIS: "${greeting}"`, false);
        return;
      }
    }

    const queryText = (detected ? cleanText : text).trim();
    if (!queryText) return;

    // Check direct HUD control commands ('clear display', 'status report', 'what is this')
    const directCmd = this.conversation.checkDirectCommand(queryText);
    if (directCmd) {
      this._executeDirectCommand(directCmd, queryText);
      return;
    }

    // Multi-turn conversation tracking
    this.conversation.addTurn('user', queryText);
    this._syncConversationContext();
    this.arcReactor?.setState('processing');
    this.intentDetector.addTranscript(queryText);
  }

  _formatTileTitle(intent) {
    switch (intent.type) {
      case 'WEATHER': return `Weather in ${intent.params?.location || intent.query}`;
      case 'PLACE': return intent.params?.place || intent.query;
      case 'FACT': return intent.params?.topic || intent.query;
      case 'BRAINSTORM': return `Ideas: ${intent.params?.topic || intent.query}`;
      case 'TIMER': return `Timer: ${intent.params?.label || intent.params?.duration || 'Countdown'}`;
      case 'SYSTEM': return `System Telemetry — Mark 85`;
      case 'FINANCE': return `${intent.params?.asset?.toUpperCase() || 'Market'} Telemetry`;
      case 'NEWS': return `Wire: ${intent.params?.topic || 'Intelligence'}`;
      case 'CALCULATOR': return `Calculation: ${intent.params?.expression || intent.query}`;
      case 'MUSIC': return `Sonic Playback: ${intent.params?.track || intent.query}`;
      case 'CALENDAR': return `Strategic Agenda & Briefings`;
      case 'SEARCH': return `Web Intel: ${intent.params?.query || intent.query}`;
      case 'IMAGE': return `Visual Gallery: ${intent.params?.query || intent.query}`;
      default: return intent.query;
    }
  }
  
  _addToHistory(text, save = true) {
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

    if (save) {
      try {
        const stored = JSON.parse(localStorage.getItem('sv_transcript_history') || '[]');
        stored.unshift({ text, time });
        localStorage.setItem('sv_transcript_history', JSON.stringify(stored.slice(0, 20)));
      } catch (e) {}
    }
  }

  _loadHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem('sv_transcript_history') || '[]');
      if (Array.isArray(stored)) {
        stored.reverse().forEach(entry => {
          if (entry && entry.text) {
            this._addToHistory(entry.text, false);
          }
        });
      }
    } catch (e) {}
  }
  
  _checkInitialState() {
    const keys = getApiKeys();
    const hasKeys = !!(keys.gemini || keys.openai);
    
    // Configure JARVIS audio options
    if (this.jarvis) {
      this.jarvis.options.enabled = keys.jarvisVoice !== 'disabled';
      this.jarvis.options.soundEffects = keys.jarvisSfx !== 'disabled';
    }

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
      },
      'timer': {
        title: '⏱️ How to use Timer',
        content: 'Set live animated countdown timers with acoustic alarms.\n\n**Try saying:**\n- "Set a timer for 5 minutes"\n- "Timer 30 seconds"\n- "Set a 1 minute tea timer"'
      },
      'system': {
        title: '🔧 How to use System Telemetry',
        content: 'Monitor hardware performance, memory heap, battery state, and Mark 85 reactor output.\n\n**Try saying:**\n- "System status"\n- "How is my battery?"\n- "Hardware diagnostics"'
      },
      'finance': {
        title: '📈 How to use Market Telemetry',
        content: 'Track real-time cryptocurrency and stock prices with sparkline trend charts.\n\n**Try saying:**\n- "Price of Bitcoin"\n- "How is Apple stock doing?"\n- "Solana price"'
      },
      'news': {
        title: '🗞️ How to use News Wire',
        content: 'Get concise intelligence briefings across technology, science, and world affairs.\n\n**Try saying:**\n- "Latest technology news"\n- "What are the headlines today?"\n- "World news briefing"'
      },
      'calculator': {
        title: '🧮 How to use Calculator',
        content: 'Solve arithmetic, percentages, powers, square roots, and math queries instantly.\n\n**Try saying:**\n- "What is 42 times 1337?"\n- "Calculate 15 percent of 250"\n- "Square root of 144"'
      },
      'music': {
        title: '🎵 How to use Sonic Playback',
        content: 'Stream and preview audio tracks from public music indices with holographic album art.\n\n**Try saying:**\n- "Play AC/DC Back in Black"\n- "Listen to Queen Bohemian Rhapsody"\n- "Play some rock music"'
      },
      'calendar': {
        title: '📅 How to use Strategic Agenda',
        content: 'Review today\'s timeline, briefings, and urgent mission appointments.\n\n**Try saying:**\n- "What is on my schedule today?"\n- "Show calendar"\n- "Upcoming briefings"'
      },
      'websearch': {
        title: '🌐 How to use Global Web Search',
        content: 'Deep search external web indices and encyclopedic archives with verified links.\n\n**Try saying:**\n- "Search the web for James Webb telescope"\n- "Lookup artificial general intelligence"\n- "Search for fusion reactor breakthroughs"'
      },
      'imagesearch': {
        title: '🖼️ How to use Visual Gallery',
        content: 'Display high-resolution visual archives and image collections on the HUD.\n\n**Try saying:**\n- "Show me pictures of Mars rover"\n- "Photos of Iron Man armor"\n- "Images of nebula"'
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
