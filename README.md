# Speaker Visualizer

Speaker Visualizer is an Electron desktop app that turns spoken prompts into live visual tiles. It listens through your microphone, transcribes speech with Gemini, detects intent, and renders useful cards for weather, places, facts, and brainstorming.

## Features

- Real-time microphone capture with a waveform visualizer
- Gemini-powered speech transcription and intent detection
- Visual dashboard tiles for:
  - weather and 5-day forecasts
  - places and landmarks
  - facts and short explanations
  - brainstorming prompts
- Tile actions for pinning, expanding, and closing results
- Recent transcript history in the sidebar
- Local settings dialog for API keys and model selection

## Requirements

- Node.js and npm
- A Gemini API key
- Microphone access
- Optional OpenWeather API key for weather tiles
- Optional Unsplash access key for place images

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

On macOS, allow microphone access when prompted. If the prompt does not appear, open System Settings, then Privacy & Security, then Microphone, and allow access for the terminal or app you use to launch Speaker Visualizer.

## API Keys

Open the settings dialog inside the app and add your keys:

- Gemini API key: required for speech transcription, intent detection, facts, and brainstorming
- OpenWeather API key: required for weather requests
- Unsplash access key: optional; place tiles fall back to Wikipedia images when it is not set

Settings are stored locally through Electron app data and browser local storage. Do not commit real API keys to the repository.

## Example Prompts

Try saying:

- "What's the weather in Tokyo?"
- "Tell me about the Taj Mahal."
- "Explain quantum computing."
- "Brainstorm ideas for a mobile app."

Press `Space` to toggle listening when the focus is not inside a text input. You can also use the microphone button in the header.

## Project Structure

```text
.
|-- main.js              # Electron main process
|-- preload.js           # Safe renderer bridge for settings IPC
|-- index.html           # App shell
|-- css/                 # Layout, components, variables, and animations
`-- js/
    |-- app.js           # App orchestration
    |-- speech.js        # Audio capture, transcription, and waveform data
    |-- intent.js        # Gemini intent classification
    |-- renderer.js      # Tile rendering
    |-- tileManager.js   # Tile state management
    |-- settings.js      # Settings dialog behavior
    `-- skills/          # Weather, place, fact, and brainstorm skills
```

## Development Notes

The current `npm test` script is a placeholder and no automated test suite is configured yet.

The app calls external APIs directly from the renderer process for speech transcription, intent detection, weather, Wikipedia summaries, and optional Unsplash images. Keep that in mind before using production or restricted keys.
