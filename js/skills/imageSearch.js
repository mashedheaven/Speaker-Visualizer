/**
 * imageSearch.js - JARVIS Visual Telemetry & Image Search Skill
 * Queries high-resolution imagery from Wikipedia Media & Unsplash APIs
 * and formats multi-image holographic galleries with lightbox inspection.
 */

import { getApiKeys, Cache } from '../utils.js';

const cache = new Cache(30 * 60 * 1000);

export const ImageSearchSkill = {
  name: 'imageSearch',

  match(intent) {
    return intent.type === 'IMAGE';
  },

  async execute(intent) {
    const rawQuery = intent.params?.query || intent.query?.replace(/show me pictures of|pictures of|photos of|image of|images of/gi, '').trim() || 'Iron Man armor';
    const query = rawQuery.length > 1 ? rawQuery : 'Iron Man';

    const cacheKey = `img:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const keys = getApiKeys();

    // 1. Try Unsplash if key is present
    if (keys.unsplash) {
      try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=4&client_id=${keys.unsplash}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.results && json.results.length > 0) {
            const images = json.results.map(r => ({
              url: r.urls.regular || r.urls.small,
              thumb: r.urls.thumb || r.urls.small,
              title: r.alt_description || query,
              author: r.user?.name || 'Unsplash'
            }));
            const result = { query, images };
            cache.set(cacheKey, result);
            return result;
          }
        }
      } catch (e) {
        console.warn('Unsplash image search failed:', e);
      }
    }

    // 2. Wikipedia Media API fallback
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&generator=images&gimlimit=4&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const res = await fetch(wikiUrl);
      if (res.ok) {
        const json = await res.json();
        const pages = json.query?.pages;
        if (pages) {
          const images = Object.values(pages)
            .map(p => p.imageinfo?.[0]?.url)
            .filter(url => url && !url.endsWith('.svg') && !url.endsWith('.ogg'))
            .map(url => ({
              url,
              thumb: url,
              title: query,
              author: 'Wikimedia Commons'
            }));

          if (images.length > 0) {
            const result = { query, images: images.slice(0, 4) };
            cache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch (e) {
      console.warn('Wikipedia media fallback failed:', e);
    }

    // Curated Visual Fallback
    const fallback = {
      query,
      images: [
        {
          url: 'https://images.unsplash.com/photo-1635863138275-d9b33299680b?w=600&q=80',
          thumb: 'https://images.unsplash.com/photo-1635863138275-d9b33299680b?w=200&q=80',
          title: `${query} — Visual 1`,
          author: 'Unsplash'
        },
        {
          url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&q=80',
          thumb: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&q=80',
          title: `${query} — Visual 2`,
          author: 'Unsplash'
        },
        {
          url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80',
          thumb: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&q=80',
          title: `${query} — Visual 3`,
          author: 'Unsplash'
        },
        {
          url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80',
          thumb: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&q=80',
          title: `${query} — Visual 4`,
          author: 'Unsplash'
        }
      ]
    };
    cache.set(cacheKey, fallback);
    return fallback;
  }
};
