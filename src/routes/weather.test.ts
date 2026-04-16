import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';

vi.mock('../lib/env.js', () => ({
  env: { OPENWEATHER_API_KEY: 'test-api-key', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const GEO_PARIS = [{ lat: 48.85, lon: 2.35, country: 'FR', name: 'Paris' }];
const WEATHER_PARIS = {
  weather: [{ description: 'clear sky' }],
  main: { temp: 20.5, feels_like: 19.0, humidity: 60 },
  wind: { speed: 5.2 },
  name: 'Paris',
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

  it('sets X-Cache-Status: MISS on a successful response', async () => {
    // Given
    mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.headers['x-cache-status']).toBe('MISS');
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
});
