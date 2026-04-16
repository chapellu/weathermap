import { z } from 'zod';
import { env } from './env.js';

export class OwmCityNotFoundError extends Error {
  constructor(city: string) {
    super(`City not found: ${city}`);
    this.name = 'OwmCityNotFoundError';
  }
}

export class OwmApiError extends Error {
  constructor(public readonly status: number) {
    super(`OpenWeatherMap API error: ${status}`);
    this.name = 'OwmApiError';
  }
}

const GeocodingResultSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  country: z.string().length(2),
  name: z.string(),
});

export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;

const CurrentWeatherSchema = z.object({
  weather: z.array(z.object({ description: z.string() })).min(1),
  main: z.object({
    temp: z.number(),
    feels_like: z.number(),
    humidity: z.number(),
  }),
  wind: z.object({ speed: z.number() }),
});

export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;

export async function geocodeCity(city: string): Promise<GeocodingResult> {
  const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${env.OPENWEATHER_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new OwmApiError(response.status);
  }

  const data: unknown = await response.json();
  const results = z.array(GeocodingResultSchema).parse(data);
  const first = results[0];

  if (!first) {
    throw new OwmCityNotFoundError(city);
  }

  return first;
}

export async function fetchCurrentWeather(coords: {
  lat: number;
  lon: number;
}): Promise<CurrentWeather> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&units=metric&lang=fr&appid=${env.OPENWEATHER_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new OwmApiError(response.status);
  }

  const data: unknown = await response.json();
  return CurrentWeatherSchema.parse(data);
}
