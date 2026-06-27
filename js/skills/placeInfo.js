import { getApiKeys, Cache } from '../utils.js';

const cache = new Cache(30 * 60 * 1000); // 30 min cache

export const PlaceInfoSkill = {
  name: 'place',
  
  match(intent) {
    return intent.type === 'PLACE';
  },
  
  async execute(intent) {
    const place = intent.params?.place || intent.query;
    if (!place) throw new Error('No place specified');
    
    const cacheKey = `place:${place.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    // Fetch Wikipedia data first, then image (reuse wiki thumbnail if no Unsplash key)
    const wikiData = await this._fetchWikipedia(place);
    const imageUrl = await this._fetchImage(place, wikiData);
    
    const result = {
      title: wikiData.title || place,
      summary: wikiData.summary || `Information about ${place}`,
      image: imageUrl,
      facts: wikiData.facts || []
    };
    
    cache.set(cacheKey, result);
    return result;
  },
  
  async _fetchWikipedia(query) {
    try {
      const searchRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
      );
      if (!searchRes.ok) {
        // Try search endpoint
        const searchAlt = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&origin=*`
        );
        const searchData = await searchAlt.json();
        if (searchData[1]?.length > 0) {
          const exactRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchData[1][0])}`
          );
          if (exactRes.ok) {
            const data = await exactRes.json();
            return {
              title: data.title,
              summary: data.extract || '',
              facts: this._extractFacts(data),
              _thumbnail: data.thumbnail?.source || null
            };
          }
        }
        return { title: query, summary: '', facts: [] };
      }
      const data = await searchRes.json();
      return {
        title: data.title,
        summary: data.extract || '',
        facts: this._extractFacts(data),
        _thumbnail: data.thumbnail?.source || null
      };
    } catch (e) {
      console.warn('Wikipedia fetch failed:', e);
      return { title: query, summary: '', facts: [] };
    }
  },
  
  _extractFacts(data) {
    const facts = [];
    if (data.description) facts.push(data.description);
    if (data.coordinates) facts.push(`📍 ${data.coordinates.lat.toFixed(2)}°, ${data.coordinates.lon.toFixed(2)}°`);
    return facts;
  },
  
  async _fetchImage(query, wikiData) {
    const keys = getApiKeys();
    if (!keys.unsplash) {
      // Reuse wiki data thumbnail instead of making a duplicate API call
      return wikiData?._thumbnail || null;
    }
    
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
        { headers: { 'Authorization': `Client-ID ${keys.unsplash}` } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.results?.[0]?.urls?.regular || null;
    } catch (e) {
      console.warn('Image fetch failed:', e);
      return null;
    }
  }
};
