import {
  CACHE_TTL_GEO,
  CACHE_TTL_WEATHER,
  cacheDelete,
  cacheGet,
  cacheSet,
  getDailyCount,
  incrementDailyCount,
} from '@/lib/cache.js';
import { isEuropean } from '@/lib/geo.js';
import { cacheHitCounter, cacheMissCounter } from '@/lib/metrics.js';
import type { CurrentWeather, ForecastResponse, GeocodingResult } from './owm-client.js';
import { fetchCurrentWeather, fetchForecast, geocodeCity } from './owm-client.js';

export const CACHE_TTL_FORECAST = 60 * 60; // 1h in seconds

export const DAILY_REQUEST_LIMIT = 10;

export class GeoRestrictedError extends Error {
  constructor() {
    super('Weather data outside Europe requires a pro plan');
    this.name = 'GeoRestrictedError';
  }
}

export class DailyLimitExceededError extends Error {
  constructor() {
    super('Daily request limit reached');
    this.name = 'DailyLimitExceededError';
  }
}

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
  remainingRequests: number | null;
}

export interface ForecastItemResult {
  dt_txt: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
}

export interface ForecastResult {
  city: string;
  country: string;
  list: ForecastItemResult[];
}

export interface ForecastServiceResponse {
  data: ForecastResult;
  cacheStatus: 'HIT' | 'MISS';
}

type RequestingUser = { email: string; role: string; plan: string };

function buildGeoKey(city: string): string {
  return `geo:${city.toLowerCase().trim()}`;
}

function buildWeatherKey(lat: number, lon: number): string {
  const lat2 = Math.round(lat * 100) / 100;
  const lon2 = Math.round(lon * 100) / 100;
  return `weather:${lat2}:${lon2}`;
}

function buildForecastKey(lat: number, lon: number): string {
  const lat2 = Math.round(lat * 100) / 100;
  const lon2 = Math.round(lon * 100) / 100;
  return `forecast:${lat2}:${lon2}`;
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

function toForecastItemResult(item: ForecastResponse['list'][number]): ForecastItemResult {
  return {
    dt_txt: item.dt_txt,
    temp: item.main.temp,
    feels_like: item.main.feels_like,
    humidity: item.main.humidity,
    wind_speed: item.wind.speed,
    description: item.weather[0]?.description ?? '',
  };
}

async function resolveGeo(city: string): Promise<GeocodingResult> {
  const geoKey = buildGeoKey(city);
  const cached = await cacheGet<GeocodingResult>(geoKey);
  if (cached) return cached;
  const geo = await geocodeCity(city);
  await cacheSet(geoKey, geo, CACHE_TTL_GEO);
  return geo;
}

function checkGeoRestriction(geo: GeocodingResult, user: RequestingUser): void {
  if (user.role !== 'admin' && user.plan !== 'pro' && !isEuropean(geo.country)) {
    throw new GeoRestrictedError();
  }
}

async function checkAndIncrementDailyCount(user: RequestingUser): Promise<number | null> {
  if (user.role === 'admin' || user.plan === 'pro') return null;
  const count = await getDailyCount(user.email);
  if (count >= DAILY_REQUEST_LIMIT) {
    throw new DailyLimitExceededError();
  }
  const newCount = await incrementDailyCount(user.email);
  return DAILY_REQUEST_LIMIT - newCount;
}

export async function getWeather(city: string, user: RequestingUser): Promise<WeatherResponse> {
  const geo = await resolveGeo(city);

  checkGeoRestriction(geo, user);
  const remainingRequests = await checkAndIncrementDailyCount(user);

  const weatherKey = buildWeatherKey(geo.lat, geo.lon);
  const cachedWeather = await cacheGet<CurrentWeather>(weatherKey);
  if (cachedWeather) {
    cacheHitCounter.inc();
    return { data: toWeatherResult(geo, cachedWeather), cacheStatus: 'HIT', remainingRequests };
  }

  const weather = await fetchCurrentWeather({ lat: geo.lat, lon: geo.lon });
  await cacheSet(weatherKey, weather, CACHE_TTL_WEATHER);
  cacheMissCounter.inc();
  return { data: toWeatherResult(geo, weather), cacheStatus: 'MISS', remainingRequests };
}

export async function getForecast(
  city: string,
  user: RequestingUser,
): Promise<ForecastServiceResponse> {
  const geo = await resolveGeo(city);

  checkGeoRestriction(geo, user);

  const forecastKey = buildForecastKey(geo.lat, geo.lon);
  const cachedForecast = await cacheGet<ForecastResponse>(forecastKey);
  if (cachedForecast) {
    cacheHitCounter.inc();
    return {
      data: {
        city: geo.name,
        country: geo.country,
        list: cachedForecast.list.map(toForecastItemResult),
      },
      cacheStatus: 'HIT',
    };
  }

  const forecast = await fetchForecast({ lat: geo.lat, lon: geo.lon });
  await cacheSet(forecastKey, forecast, CACHE_TTL_FORECAST);
  cacheMissCounter.inc();
  return {
    data: {
      city: geo.name,
      country: geo.country,
      list: forecast.list.map(toForecastItemResult),
    },
    cacheStatus: 'MISS',
  };
}

export async function invalidateWeatherCache(city: string): Promise<void> {
  const geoKey = buildGeoKey(city);
  const geo = await cacheGet<GeocodingResult>(geoKey);
  if (geo) {
    await cacheDelete(buildWeatherKey(geo.lat, geo.lon));
    await cacheDelete(buildForecastKey(geo.lat, geo.lon));
  }
  await cacheDelete(geoKey);
}
