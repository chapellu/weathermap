import { geocodeCity, fetchCurrentWeather } from './owm-client.js';
import type { GeocodingResult, CurrentWeather } from './owm-client.js';
import { cacheGet, cacheSet, CACHE_TTL_GEO, CACHE_TTL_WEATHER } from './cache.js';
import { cacheHitCounter, cacheMissCounter } from './metrics.js';

export interface WeatherResult {
  city: string;
  country: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
}

export interface WeatherResponse {
  data: WeatherResult;
  cacheStatus: 'HIT' | 'MISS';
}

function buildGeoKey(city: string): string {
  return `geo:${city.toLowerCase().trim()}`;
}

function buildWeatherKey(lat: number, lon: number): string {
  const lat2 = Math.round(lat * 100) / 100;
  const lon2 = Math.round(lon * 100) / 100;
  return `weather:${lat2}:${lon2}`;
}

function toWeatherResult(geo: GeocodingResult, weather: CurrentWeather): WeatherResult {
  return {
    city: geo.name,
    country: geo.country,
    temp: weather.main.temp,
    feels_like: weather.main.feels_like,
    humidity: weather.main.humidity,
    wind_speed: weather.wind.speed,
    description: weather.weather[0]?.description ?? '',
  };
}

export async function getWeather(city: string): Promise<WeatherResponse> {
  const geoKey = buildGeoKey(city);
  let geo = await cacheGet<GeocodingResult>(geoKey);
  if (!geo) {
    geo = await geocodeCity(city);
    await cacheSet(geoKey, geo, CACHE_TTL_GEO);
  }

  const weatherKey = buildWeatherKey(geo.lat, geo.lon);
  const cachedWeather = await cacheGet<CurrentWeather>(weatherKey);
  if (cachedWeather) {
    cacheHitCounter.inc();
    return { data: toWeatherResult(geo, cachedWeather), cacheStatus: 'HIT' };
  }

  const weather = await fetchCurrentWeather({ lat: geo.lat, lon: geo.lon });
  await cacheSet(weatherKey, weather, CACHE_TTL_WEATHER);
  cacheMissCounter.inc();
  return { data: toWeatherResult(geo, weather), cacheStatus: 'MISS' };
}
