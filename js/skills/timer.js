/**
 * timer.js - JARVIS Countdown & Chronometer Skill
 * Parses timer duration from voice parameters (seconds, minutes, hours),
 * returns countdown metadata for live holographic circular ring rendering.
 */

export const TimerSkill = {
  name: 'timer',

  match(intent) {
    return intent.type === 'TIMER';
  },

  async execute(intent) {
    let seconds = 0;
    let label = 'Timer';

    const rawSeconds = intent.params?.seconds;
    if (rawSeconds !== undefined && rawSeconds !== null && rawSeconds !== '') {
      const numeric = Number(rawSeconds);
      if (Number.isFinite(numeric) && numeric > 0) {
        seconds = Math.round(numeric);
      } else {
        seconds = this._extractDuration(String(rawSeconds));
      }
    }

    if (seconds <= 0 && intent.params?.duration) {
      seconds = this._extractDuration(String(intent.params.duration));
    }

    if (seconds <= 0 && intent.query) {
      seconds = this._extractDuration(intent.query);
    }

    if (seconds <= 0) {
      seconds = 60; // Default 1 minute
    }

    if (intent.params?.label) {
      label = intent.params.label;
    }

    // Minimum 1 second, max 24 hours
    seconds = Math.max(1, Math.min(seconds, 86400));

    const now = Date.now();
    return {
      label,
      totalSeconds: seconds,
      remainingSeconds: seconds,
      startTime: now,
      endTime: now + seconds * 1000
    };
  },

  _extractDuration(text) {
    let total = 0;
    const str = String(text).toLowerCase();

    const hours = str.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
    const minutes = str.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
    const seconds = str.match(/(\d+)\s*(?:seconds?|secs?|s)\b/);

    if (hours) total += parseInt(hours[1], 10) * 3600;
    if (minutes) total += parseInt(minutes[1], 10) * 60;
    if (seconds) total += parseInt(seconds[1], 10);

    // If bare number without unit (e.g. "timer for 5")
    if (total === 0) {
      const bareNumber = str.match(/\b(\d+)\b/);
      if (bareNumber) {
        const val = parseInt(bareNumber[1], 10);
        // Default to minutes if <= 10, otherwise seconds
        total = val <= 10 ? val * 60 : val;
      }
    }

    return total;
  },

  parseDuration(text) {
    const total = this._extractDuration(text);
    return total > 0 ? total : 60;
  }
};
