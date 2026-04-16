import { geocodeCity, fetchCurrentWeather } from './owm-client.js';

export interface WeatherResult {
  city: string;
  country: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
}

export async function getWeather(city: string): Promise<WeatherResult> {
  const geo = await geocodeCity(city);
  const weather = await fetchCurrentWeather({ lat: geo.lat, lon: geo.lon });

  return {
    city: weather.name,
    country: geo.country,
    temp: weather.main.temp,
    feels_like: weather.main.feels_like,
    humidity: weather.main.humidity,
    wind_speed: weather.wind.speed,
    description: weather.weather[0]?.description ?? '',
  };
}
