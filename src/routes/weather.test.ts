import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

vi.mock('../lib/env.js', () => ({
  env: { OPENWEATHER_API_KEY: 'test-api-key', NODE_ENV: 'test' },
}));

vi.mock('../lib/cache.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  closeCache: vi.fn().mockResolvedValue(undefined),
  CACHE_TTL_GEO: 86400,
  CACHE_TTL_WEATHER: 600,
}));

afterEach(() => {
  vi.clearAllMocks(); // reset call counts on vi.mock() mocks
  vi.restoreAllMocks(); // restore spies (e.g. global.fetch)
});

const GEO_PARIS = [{ lat: 48.85, lon: 2.35, country: 'FR', name: 'Paris' }];
const WEATHER_PARIS = {
  weather: [{ description: 'clear sky' }],
  main: { temp: 20.5, feels_like: 19.0, humidity: 60 },
  wind: { speed: 5.2 },
};

function mockFetch(...responses: Array<{ ok: boolean; status?: number; body?: unknown }>) {
  const spy = vi.spyOn(global, 'fetch');
  for (const r of responses) {
    spy.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body),
    } as Response);
  }
  return spy;
}

describe('GET /weather', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the weather data for a valid city', async () => {
    // Given
    mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      city: 'Paris',
      country: 'FR',
      temp: 20.5,
      feels_like: 19.0,
      humidity: 60,
      wind_speed: 5.2,
      description: 'clear sky',
    });
  });

  it('sets X-Cache-Status: MISS when neither cache level is populated', async () => {
    // Given — both cacheGet calls return null (default mock)
    mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.headers['x-cache-status']).toBe('MISS');
  });

  it('sets X-Cache-Status: HIT and skips OWM when weather is cached', async () => {
    // Given — geo and weather both hit the cache
    vi.mocked(cacheGet)
      .mockResolvedValueOnce(GEO_PARIS[0]) // geo hit
      .mockResolvedValueOnce(WEATHER_PARIS); // weather hit
    const fetchSpy = vi.spyOn(global, 'fetch');

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache-status']).toBe('HIT');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when the city query param is missing', async () => {
    // When
    const response = await app.inject({ method: 'GET', url: '/weather' });

    // Then
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the city is not found', async () => {
    // Given
    mockFetch({ ok: true, body: [] });

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Atlantis' });

    // Then
    expect(response.statusCode).toBe(404);
  });

  it('returns 502 when the OWM API returns an error', async () => {
    // Given
    mockFetch({ ok: false, status: 503 });

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.statusCode).toBe(502);
  });

  it('stores geo and weather results in cache on a MISS', async () => {
    // Given
    mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

    // When
    await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then — two cacheSet calls: one for geo, one for weather
    expect(vi.mocked(cacheSet)).toHaveBeenCalledTimes(2);
  });
});
