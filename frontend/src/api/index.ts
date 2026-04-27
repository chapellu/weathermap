async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { message?: string }).message ?? res.statusText;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface Weather {
  city: string;
  country: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
}

export interface ForecastItem {
  dt_txt: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
}

export interface Forecast {
  city: string;
  country: string;
  list: ForecastItem[];
}

export const api = {
  getWeather: (city: string) => apiFetch<Weather>(`/weather?city=${encodeURIComponent(city)}`),
  getForecast: (city: string) =>
    apiFetch<Forecast>(`/weather/forecast?city=${encodeURIComponent(city)}`),
};

export function weatherIcon(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('thunderstorm')) return '⛈️';
  if (d.includes('drizzle')) return '🌦️';
  if (d.includes('shower rain') || d.includes('heavy rain')) return '🌧️';
  if (d.includes('rain')) return '🌧️';
  if (d.includes('snow')) return '❄️';
  if (d.includes('mist') || d.includes('fog') || d.includes('haze')) return '🌫️';
  if (d.includes('clear')) return '☀️';
  if (d.includes('few clouds')) return '🌤️';
  if (d.includes('scattered clouds')) return '⛅';
  if (d.includes('clouds')) return '☁️';
  return '🌡️';
}
