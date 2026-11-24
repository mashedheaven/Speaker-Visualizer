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
    let seconds = 60; // Default 1 minute
    let label = 'Timer';

    if (intent.params?.seconds) {
      seconds = parseInt(intent.params.seconds, 10);
    } else if (intent.params?.duration) {
      seconds = this.parseDuration(intent.params.duration);
    } else if (intent.query) {
      seconds = this.parseDuration(intent.query);
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

  parseDuration(text) {
    let total = 0;
    const str = text.toLowerCase();

    const hours = str.match(/(\d+)\s*(?:hour|hr|h)/);
    const minutes = str.match(/(\d+)\s*(?:minute|min|m)/);
    const seconds = str.match(/(\d+)\s*(?:second|sec|s)/);

    if (hours) total += parseInt(hours[1], 10) * 3600;
    if (minutes) total += parseInt(minutes[1], 10) * 60;
    if (seconds) total += parseInt(seconds[1], 10);

    // If bare number without unit (e.g. "timer for 5")
    if (total === 0) {
      const bareNumber = str.match(/\b(\d+)\b/);
      if (bareNumber) {
        const val = parseInt(bareNumber[1], 10);
        // Default to minutes if < 60, otherwise seconds
        total = val <= 10 ? val * 60 : val;
      }
    }

    return total > 0 ? total : 60;
  }
};
