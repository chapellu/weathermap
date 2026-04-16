import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  geocodeCity,
  fetchCurrentWeather,
  OwmCityNotFoundError,
  OwmApiError,
} from './owm-client.js';

vi.mock('./env.js', () => ({
  env: { OPENWEATHER_API_KEY: 'test-api-key', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('geocodeCity', () => {
  it('returns the geocoding result for a valid city', async () => {
    // Given
    const mockPayload = [{ lat: 48.85, lon: 2.35, country: 'FR', name: 'Paris' }];
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    // When
    const result = await geocodeCity('Paris');

    // Then
    expect(result).toEqual({ lat: 48.85, lon: 2.35, country: 'FR', name: 'Paris' });
  });

  it('throws OwmCityNotFoundError when the API returns an empty array', async () => {
    // Given
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    // When / Then
    await expect(geocodeCity('UnknownCity')).rejects.toThrow(OwmCityNotFoundError);
  });

  it('throws OwmApiError on a non-OK HTTP response', async () => {
    // Given
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    // When / Then
    await expect(geocodeCity('Paris')).rejects.toThrow(OwmApiError);
  });

  it('includes the city name in the OwmCityNotFoundError message', async () => {
    // Given
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    // When / Then
    await expect(geocodeCity('Atlantis')).rejects.toThrow('City not found: Atlantis');
  });

  it('includes the HTTP status in the OwmApiError message', async () => {
    // Given
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    // When / Then
    await expect(geocodeCity('Paris')).rejects.toThrow('429');
  });
});

describe('fetchCurrentWeather', () => {
  it('returns weather data for valid coordinates', async () => {
    // Given
    const mockPayload = {
      weather: [{ description: 'clear sky' }],
      main: { temp: 20.5, feels_like: 19.0, humidity: 60 },
      wind: { speed: 5.2 },
      name: 'Paris',
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    // When
    const result = await fetchCurrentWeather({ lat: 48.85, lon: 2.35 });

    // Then
    expect(result).toEqual(mockPayload);
  });

  it('throws OwmApiError on a non-OK HTTP response', async () => {
    // Given
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    // When / Then
    await expect(fetchCurrentWeather({ lat: 48.85, lon: 2.35 })).rejects.toThrow(OwmApiError);
  });

  it('uses metric units and French language in the request URL', async () => {
    // Given
    const mockPayload = {
      weather: [{ description: 'nuageux' }],
      main: { temp: 15, feels_like: 14, humidity: 75 },
      wind: { speed: 3 },
      name: 'Lyon',
    };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    // When
    await fetchCurrentWeather({ lat: 45.75, lon: 4.85 });

    // Then
    const calledUrl = spy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('units=metric');
    expect(calledUrl).toContain('lang=fr');
  });
});
