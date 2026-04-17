import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockRedis } from '#mocks/ioredis.js';
import { buildApp } from '@/index.js';
import { generateTestToken } from '@/test/helpers/auth.helper.js';

vi.mock('@/lib/env.js');
vi.mock('ioredis');

const { mockDb } = vi.hoisted(() => {
  const authUser = { id: 1, email: 'test@example.com', role: 'viewer', plan: 'free' };
  return {
    mockDb: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([authUser])),
          })),
        })),
      })),
    },
  };
});

vi.mock('@/db/client.js', () => ({ db: mockDb }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
  let authHeader: string;

  beforeAll(async () => {
    const token = await generateTestToken();
    authHeader = `Bearer ${token}`;
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
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: authHeader },
    });

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
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: authHeader },
    });

    // Then
    expect(response.headers['x-cache-status']).toBe('MISS');
  });

  it('sets X-Cache-Status: HIT and skips OWM when weather is cached', async () => {
    // Given — geo and weather both hit the cache; daily count check sits between the two gets
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])) // geo hit
      .mockResolvedValueOnce(null) // daily:...: → 0 (count check)
      .mockResolvedValueOnce(JSON.stringify(WEATHER_PARIS)); // weather hit
    const fetchSpy = vi.spyOn(global, 'fetch');

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: authHeader },
    });

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
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Atlantis',
      headers: { authorization: authHeader },
    });

    // Then
    expect(response.statusCode).toBe(404);
  });

  it('returns 502 when the OWM API returns an error', async () => {
    // Given
    mockFetch({ ok: false, status: 503 });

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: authHeader },
    });

    // Then
    expect(response.statusCode).toBe(502);
  });

  it('stores geo and weather results in cache on a MISS', async () => {
    // Given
    mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

    // When
    await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: authHeader },
    });

    // Then — two Redis SET calls: one for geo, one for weather
    expect(mockRedis.set).toHaveBeenCalledTimes(2);
  });
});
