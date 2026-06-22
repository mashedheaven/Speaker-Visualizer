import { getApiKeys, Cache } from '../utils.js';

const cache = new Cache(10 * 60 * 1000);

export const BrainstormSkill = {
  name: 'brainstorm',
  
  match(intent) {
    return intent.type === 'BRAINSTORM';
  },
  
  async execute(intent) {
    const topic = intent.params?.topic || intent.query;
    if (!topic) throw new Error('No topic specified');
    
    const cacheKey = `brainstorm:${topic.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const keys = getApiKeys();
    if (!keys.gemini) throw new Error('Gemini API key not set');
    
    const model = keys.model || 'gemini-2.0-flash';
    const prompt = `Generate 6-8 creative and diverse ideas about: "${topic}"

Return ONLY a JSON array of strings, each being one concise idea (max 15 words each). No markdown, no explanation.
Example: ["Idea one here", "Idea two here", "Idea three here"]

Be creative, practical, and diverse in your suggestions.`;
    
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 512,
            responseMimeType: 'application/json'
          }
        })
      }
    );
    
    if (!res.ok) throw new Error(`API error ${res.status}`);
    
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    let ideas;
    try {
      ideas = JSON.parse(text);
      if (!Array.isArray(ideas)) ideas = [text];
    } catch {
      // Try to extract ideas from text
      ideas = text.split('\n').filter(l => l.trim()).map(l => l.replace(/^[\d\-\*\.]+\s*/, '').trim());
    }
    
    const result = { ideas };
    cache.set(cacheKey, result);
    return result;
  }
};
