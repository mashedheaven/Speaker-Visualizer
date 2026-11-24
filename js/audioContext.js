/**
 * audioContext.js - Centralized Unified Web Audio Pipeline
 * Provides a single shared AudioContext across SpeechEngine, AudioAnalyzer,
 * and JarvisVoice to prevent resource duplication and audio buffer contention.
 */

let sharedAudioContext = null;

export function getSharedAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}
