# 🧊 JARVIS — Speaker Visualizer (Mark 85)

> *"Sometimes you gotta run before you can walk."* — Tony Stark

**JARVIS — Speaker Visualizer** is a real-time, voice-controlled holographic dashboard for macOS and desktop. Powered by Google Gemini and Web Audio telemetry, it transforms spoken commands into dynamic visual cards, speaks responses with a cultured British vocal persona, and features a cinematic Iron Man Arc Reactor HUD interface.

---

## ✨ Features

### 🔮 The Suit (Holographic Interface)
- **Arc Reactor Core Visualizer**: Audio-reactive 2D canvas engine with a 24-segment frequency ring, counter-rotating telemetry markers, pulsing core orb, and 50 orbiting energy particles.
- **Ambient HUD Environment**: Background canvas with converging 3D perspective horizon lines, subtle pulsed hexagonal grids, data streams, and corner reticle targeting brackets.
- **Holographic Materialization**: Cards materialize with glowing laser scan-lines and 3D parallax mouse tilt with dynamic light glare.
- **Active Arc Reactor Trigger**: The microphone button features a rotating dashed reactor ring and acoustic pulse feedback.

### 🧠 The Brain (Conversational Intelligence & Voice)
- **JARVIS Vocal Persona (TTS)**: Synthesizes responses using an authentic British accent, delivering concise spoken briefings for every query.
- **Procedural Acoustic Telemetry**: Synthesized HUD audio cues (activation ping, affirmative chirp, completion chord) via Web Audio API oscillators — zero external MP3 assets.
- **Wake Word Detection**: Say *"Jarvis"*, *"Hey Jarvis"*, or *"Oh Jarvis"* to activate.
- **Multi-Turn Context & Pronoun Resolution**: Remembers recent dialogue and entities so follow-ups like *"What about tomorrow?"* or *"Where is it?"* resolve naturally.
- **Direct HUD Commands**:
  - *"Jarvis, status report"* — Diagnostics on active modules and core status.
  - *"Jarvis, clear screen"* — Wipes unpinned tiles with acoustic confirmation.
  - *"Jarvis, what is this?"* — Explains the newest or active card on screen.

### ⚔️ The Arsenal (8 Active Skills)
1. 🌤️ **Weather**: Current telemetry, humidity, wind speed, and 5-day forecasts.
2. 🏛️ **Places & Landmarks**: High-resolution imagery, geographical facts, and summaries.
3. 📚 **Facts & Knowledge**: Deep explanations rendered in clean formatted markdown.
4. 💡 **Brainstorm Ideas**: Creative ideation matrices and strategy cards.
5. ⏱️ **Timer & Countdown**: Live circular SVG countdown gauge with audio alarms.
6. 🔧 **System Telemetry**: CPU core load, memory heap, battery charge, and Mark 85 reactor status.
7. 📈 **Market & Crypto**: Real-time asset valuations (BTC, ETH, AAPL, TSLA), deltas, and SVG sparkline charts.
8. 🗞️ **Intelligence Wire**: Live categorized headline briefings across tech, science, and world news.

### 💾 The Workshop (Persistence & Security)
- **Tile Persistence**: Pinned and ready tiles automatically restore onto your grid across app restarts.
- **History Persistence**: Transcript history in the sidebar is preserved across sessions.
- **Encrypted Key Storage**: API keys are encrypted at rest using Electron `safeStorage` (macOS Keychain).
- **Native macOS Menu Bar Icon**: High-contrast template Arc Reactor icon that adapts to light & dark menu bars.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) and npm
- A [Google Gemini API Key](https://aistudio.google.com/apikey) (free)
- Microphone access

### Installation

```bash
git clone "https://github.com/Gogul-Raj/Speaker-Visualizer.git"
cd "Speaker Visualizer"
npm install
```

### Launch

```bash
npm start
```

*Note on macOS: Grant microphone permissions when prompted in System Settings.*

---

## 🔑 Configuration

Open the **Settings** dialog (<kbd>⚙️</kbd>) inside the application:

- **Gemini API Key**: Required for speech recognition, intent routing, and intelligence briefings.
- **OpenWeather API Key**: *(Optional)* For live global weather data.
- **Unsplash Key**: *(Optional)* For enhanced place photography (falls back to Wikipedia).
- **Audio Persona**: Toggle JARVIS spoken responses (TTS) and HUD chimes.

All credentials are saved securely via Electron `safeStorage`.

---

## 🎙️ Voice Command Examples

Press <kbd>Space</kbd> or click the Arc Reactor button:

- *"Jarvis"* → *"Online and listening, sir."*
- *"Jarvis, what's the weather in Tokyo?"*
- *"Jarvis, set a timer for 5 minutes"*
- *"Jarvis, price of Bitcoin"*
- *"Jarvis, hardware diagnostics"*
- *"Jarvis, latest tech news"*
- *"Jarvis, tell me about the Taj Mahal"*
- *"Jarvis, brainstorm mobile app concepts"*
- *"Jarvis, status report"*
- *"Jarvis, clear screen"*

---

## 📁 Architecture

```text
Speaker Visualizer/
├── main.js                  # Electron main process (safeStorage, CSP, native tray)
├── preload.js               # Context isolation bridge
├── index.html               # HUD shell & canvas containers
├── css/
│   ├── variables.css        # Design tokens, color scales, HUD glow tokens
│   ├── layout.css           # Grid architecture & canvas overlays
│   ├── components.css       # Holographic tiles, Arc Reactor mic, gauges, cards
│   ├── animations.css       # Scanline, disintegration, reactor rotation
│   └── extra.css            # Interactive prompt chips, scrollbars
└── js/
    ├── app.js               # Central coordinator
    ├── arcReactor.js        # Canvas 2D audio-reactive Arc Reactor visualizer
    ├── hudBackground.js     # Ambient 3D perspective grid & hex telemetry
    ├── jarvisVoice.js       # British TTS synthesis & procedural audio chimes
    ├── conversation.js      # Multi-turn conversational memory & HUD commands
    ├── intent.js            # Gemini structured intent classifier
    ├── renderer.js          # Tile lifecycle, 3D parallax tilt & SVG gauges
    ├── tileManager.js       # Persistent tile state manager (localStorage)
    ├── speech.js            # Audio capture, VAD, and transcription backends
    ├── settings.js          # Settings modal & provider controller
    ├── utils.js             # Event emitter, debouncing, markdown renderer
    └── skills/
        ├── weather.js       # OpenWeatherMap integration
        ├── placeInfo.js     # Wikipedia + Unsplash landmark records
        ├── generalFact.js   # Knowledge explanation skill
        ├── brainstorm.js    # Ideation generator
        ├── timer.js         # Countdown chronometer skill
        ├── system.js        # Hardware & Mark 85 reactor telemetry
        ├── finance.js       # Crypto & stock market ticker
        └── news.js          # Intelligence wire headlines
```

---

## 🛡️ License

MIT License. Built for voice-to-vision intelligence.
