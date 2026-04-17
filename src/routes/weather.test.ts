import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockRedis } from '#mocks/ioredis.js';
import { buildApp } from '@/index.js';
import { generateTestToken } from '@/test/helpers/auth.helper.js';
import { setupDbSelectUser } from '@/test/helpers/mocks.js';

vi.mock('@/lib/env.js');
vi.mock('ioredis');

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/db/client.js', () => ({ db: mockDb }));

const VIEWER_USER = { id: 1, email: 'viewer@example.com', role: 'viewer', plan: 'free' };
const PRO_USER = { id: 2, email: 'pro@example.com', role: 'viewer', plan: 'pro' };
const ADMIN_USER = { id: 3, email: 'admin@example.com', role: 'admin', plan: 'pro' };

const GEO_PARIS = [{ lat: 48.85, lon: 2.35, country: 'FR', name: 'Paris' }];
const GEO_NEW_YORK = [{ lat: 40.71, lon: -74.01, country: 'US', name: 'New York' }];
const WEATHER_PARIS = {
  weather: [{ description: 'clear sky' }],
  main: { temp: 20.5, feels_like: 19.0, humidity: 60 },
  wind: { speed: 5.2 },
};
const FORECAST_PARIS = {
  city: { name: 'Paris', country: 'FR' },
  list: [
    {
      dt_txt: '2024-01-01 12:00:00',
      main: { temp: 20.5, feels_like: 19.0, humidity: 60 },
      weather: [{ description: 'clear sky' }],
      wind: { speed: 5.2 },
    },
  ],
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

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Weather routes', () => {
  let app: FastifyInstance;
  let viewerHeader: string;
  let proHeader: string;
  let adminHeader: string;

  beforeAll(async () => {
    viewerHeader = `Bearer ${await generateTestToken(VIEWER_USER.email)}`;
    proHeader = `Bearer ${await generateTestToken(PRO_USER.email)}`;
    adminHeader = `Bearer ${await generateTestToken(ADMIN_USER.email)}`;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /weather', () => {
    it('returns 200 with weather data for a valid city', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
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

    it('sets X-Cache-Status: MISS when cache is empty', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.headers['x-cache-status']).toBe('MISS');
    });

    it('sets X-Cache-Status: HIT and skips OWM when weather is cached', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])) // geo hit
        .mockResolvedValueOnce(null) // daily count = 0
        .mockResolvedValueOnce(JSON.stringify(WEATHER_PARIS)); // weather hit
      const fetchSpy = vi.spyOn(global, 'fetch');

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-cache-status']).toBe('HIT');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit headers for free plan users', async () => {
      // Given — geo cached, daily count = 5, incr → 6, remaining = 4
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])) // geo hit
        .mockResolvedValueOnce('5'); // daily count = 5
      mockRedis.incr.mockResolvedValueOnce(6);
      mockFetch({ ok: true, body: WEATHER_PARIS }); // only weather fetch needed

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('4');
    });

    it('omits X-RateLimit-Remaining for pro plan users', async () => {
      // Given
      setupDbSelectUser(mockDb, PRO_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: proHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
    });

    it('returns 400 when the city query param is missing', async () => {
      // When
      const response = await app.inject({ method: 'GET', url: '/weather' });

      // Then
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when city is outside Europe for free plan', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: true, body: GEO_NEW_YORK });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=New York',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });

    it('returns 403 when daily limit is exceeded', async () => {
      // Given — geo cached, daily count already at limit
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])) // geo hit
        .mockResolvedValueOnce('10'); // count = DAILY_REQUEST_LIMIT

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when the city is not found', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: true, body: [] });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Atlantis',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(404);
    });

    it('returns 502 when the OWM API returns an error', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: false, status: 503 });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(502);
    });

    it('stores geo and weather in cache on a MISS', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: WEATHER_PARIS });

      // When
      await app.inject({
        method: 'GET',
        url: '/weather?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then — two SET calls: geo and weather
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET /weather/forecast', () => {
    it('returns 200 with forecast for pro user (MISS)', async () => {
      // Given
      setupDbSelectUser(mockDb, PRO_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: FORECAST_PARIS });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Paris',
        headers: { authorization: proHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        city: 'Paris',
        country: 'FR',
        list: [expect.objectContaining({ description: 'clear sky' })],
      });
      expect(response.headers['x-cache-status']).toBe('MISS');
    });

    it('returns 200 with forecast for admin user', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);
      mockFetch({ ok: true, body: GEO_PARIS }, { ok: true, body: FORECAST_PARIS });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Paris',
        headers: { authorization: adminHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-cache-status']).toBe('MISS');
    });

    it('sets X-Cache-Status: HIT when forecast is cached', async () => {
      // Given
      setupDbSelectUser(mockDb, PRO_USER);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])) // geo hit
        .mockResolvedValueOnce(JSON.stringify(FORECAST_PARIS)); // forecast hit
      const fetchSpy = vi.spyOn(global, 'fetch');

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Paris',
        headers: { authorization: proHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-cache-status']).toBe('HIT');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 403 for free plan viewer', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'GET', url: '/weather/forecast?city=Paris' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when city is not found', async () => {
      // Given
      setupDbSelectUser(mockDb, PRO_USER);
      mockFetch({ ok: true, body: [] });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Atlantis',
        headers: { authorization: proHeader },
      });

      // Then
      expect(response.statusCode).toBe(404);
    });

    it('returns 502 when the OWM API returns an error', async () => {
      // Given
      setupDbSelectUser(mockDb, PRO_USER);
      mockFetch({ ok: false, status: 503 });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/weather/forecast?city=Paris',
        headers: { authorization: proHeader },
      });

      // Then
      expect(response.statusCode).toBe(502);
    });
  });

  describe('POST /weather/cache/invalidate', () => {
    it('returns 200 for admin', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);

      // When
      const response = await app.inject({
        method: 'POST',
        url: '/weather/cache/invalidate?city=Paris',
        headers: { authorization: adminHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ message: 'Cache invalidated for city: Paris' });
    });

    it('deletes geo, weather, and forecast cache keys when geo is cached', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(GEO_PARIS[0])); // geo hit → also delete weather+forecast

      // When
      await app.inject({
        method: 'POST',
        url: '/weather/cache/invalidate?city=Paris',
        headers: { authorization: adminHeader },
      });

      // Then — 3 DEL calls: weather key, forecast key, geo key
      expect(mockRedis.del).toHaveBeenCalledTimes(3);
    });

    it('returns 403 for viewer', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);

      // When
      const response = await app.inject({
        method: 'POST',
        url: '/weather/cache/invalidate?city=Paris',
        headers: { authorization: viewerHeader },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/weather/cache/invalidate?city=Paris',
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
