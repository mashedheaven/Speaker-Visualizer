import { getApiKeys, Cache } from '../utils.js';

const cache = new Cache(10 * 60 * 1000); // 10 min cache for weather

export const WeatherSkill = {
  name: 'weather',
  
  match(intent) {
    return intent.type === 'WEATHER';
  },
  
  async execute(intent) {
    const location = intent.params?.location || intent.query?.replace(/weather\s*(in|for|at)?\s*/i, '').trim();
    if (!location) throw new Error('No location specified');
    
    const cacheKey = `weather:${location.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const keys = getApiKeys();
    if (!keys.openweather) throw new Error('OpenWeather API key not set');
    
    // Current weather
    const currentRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${keys.openweather}`
    );
    if (!currentRes.ok) {
      if (currentRes.status === 404) throw new Error(`Location "${location}" not found`);
      throw new Error(`Weather API error: ${currentRes.status}`);
    }
    const current = await currentRes.json();
    
    // 5-day forecast
    let forecast = [];
    try {
      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${keys.openweather}`
      );
      if (forecastRes.ok) {
        const forecastData = await forecastRes.json();
        // Get one entry per day (noon forecasts)
        const days = new Map();
        forecastData.list.forEach(entry => {
          const date = entry.dt_txt.split(' ')[0];
          const hour = parseInt(entry.dt_txt.split(' ')[1].split(':')[0]);
          if (!days.has(date) && hour >= 11 && hour <= 14) {
            const dayName = new Date(date).toLocaleDateString('en', { weekday: 'short' });
            days.set(date, {
              day: dayName,
              temp: entry.main.temp,
              icon: entry.weather[0].icon,
              condition: entry.weather[0].description
            });
          }
        });
        forecast = Array.from(days.values()).slice(0, 5);
      }
    } catch (e) {
      console.warn('Forecast fetch failed:', e);
    }
    
    const result = {
      temp: current.main.temp,
      feelsLike: current.main.feels_like,
      condition: current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1),
      icon: current.weather[0].icon,
      location: `${current.name}, ${current.sys.country}`,
      humidity: current.main.humidity,
      windSpeed: current.wind.speed,
      forecast
    };
    
    cache.set(cacheKey, result);
    return result;
  }
};
