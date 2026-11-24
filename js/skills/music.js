/**
 * music.js - JARVIS Acoustic Playback & Sonic Telemetry Skill
 * Searches and streams music previews using public media indices,
 * renders high-resolution holographic album sleeves, audio waveforms,
 * and live audio player controls.
 */

import { Cache } from '../utils.js';

const cache = new Cache(30 * 60 * 1000); // 30 min cache

export const MusicSkill = {
  name: 'music',

  match(intent) {
    return intent.type === 'MUSIC';
  },

  async execute(intent) {
    const rawQuery = intent.params?.track || intent.params?.query || intent.query?.replace(/play|music|song|listen to/gi, '').trim() || 'AC/DC Back in Black';
    const query = rawQuery.length > 1 ? rawQuery : 'Back in Black';

    const cacheKey = `music:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.results && json.results.length > 0) {
          const track = json.results[0];
          const result = {
            title: track.trackName || query,
            artist: track.artistName || 'Artist',
            album: track.collectionName || 'Album',
            albumArt: (track.artworkUrl100 || '').replace('100x100', '400x400'),
            previewUrl: track.previewUrl || null,
            genre: track.primaryGenreName || 'Rock',
            year: (track.releaseDate || '').substring(0, 4) || '2024'
          };
          cache.set(cacheKey, result);
          return result;
        }
      }
    } catch (e) {
      console.warn('iTunes music lookup failed, using Stark playlist fallback:', e);
    }

    // Tony Stark Classic Rock Fallback
    const fallback = {
      title: 'Back in Black',
      artist: 'AC/DC',
      album: 'Back in Black (Remastered)',
      albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
      previewUrl: null,
      genre: 'Hard Rock',
      year: '1980'
    };
    cache.set(cacheKey, fallback);
    return fallback;
  }
};
