import { getApiKeys, Cache } from '../utils.js';

const cache = new Cache(15 * 60 * 1000);

export const GeneralFactSkill = {
  name: 'fact',
  
  match(intent) {
    return intent.type === 'FACT';
  },
  
  async execute(intent) {
    const topic = intent.params?.topic || intent.query;
    if (!topic) throw new Error('No topic specified');
    
    const cacheKey = `fact:${topic.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const keys = getApiKeys();
    if (!keys.gemini) throw new Error('Gemini API key not set');
    
    // Fetch Wikipedia context and LLM explanation in parallel
    const [wikiContext, llmResponse] = await Promise.all([
      this._fetchWikiContext(topic),
      this._fetchLLMExplanation(topic, keys.gemini, keys.model)
    ]);
    
    // Combine: prefer LLM explanation but enrich with wiki if available
    const content = llmResponse || wikiContext || `No information found for "${topic}"`;
    
    const result = { content };
    cache.set(cacheKey, result);
    return result;
  },
  
  async _fetchWikiContext(topic) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.extract || null;
    } catch { return null; }
  },
  
  async _fetchLLMExplanation(topic, apiKey, model = 'gemini-3.5-flash') {
    try {
      const prompt = `Explain "${topic}" concisely for a curious adult. Use this format:
### ${topic}
A 2-3 sentence overview.

### Key Points
- Point 1
- Point 2
- Point 3
- Point 4

Keep it under 150 words. Use simple language. Use markdown formatting.`;
      
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
          })
        }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
      console.warn('LLM explanation failed:', e);
      return null;
    }
  }
};
