import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../index.js';
import { generateTestToken, TEST_USER } from '../test/helpers/auth.helper.js';
import { setupDbSelectUser } from '../test/helpers/mocks.js';

vi.mock('../lib/env.js');
vi.mock('ioredis');

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../db/client.js', () => ({ db: mockDb }));

const DB_USER = { id: 1, ...TEST_USER };

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Me routes', () => {
  let app: FastifyInstance;
  let authHeader: string;

  beforeAll(async () => {
    authHeader = `Bearer ${await generateTestToken()}`;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /me', () => {
    it('returns 200 with current user', async () => {
      // Given
      setupDbSelectUser(mockDb, DB_USER);

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: authHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ email: TEST_USER.email });
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'GET', url: '/me' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /me/plan', () => {
    it('returns 200 with updated plan', async () => {
      // Given
      setupDbSelectUser(mockDb, DB_USER);
      const updatedUser = { ...DB_USER, plan: 'pro' };
      mockDb.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      });

      // When
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/plan',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ plan: 'pro' });
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/plan',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /me/daily-count', () => {
    it('returns 200 with remaining requests after reset', async () => {
      // Given
      setupDbSelectUser(mockDb, DB_USER);

      // When
      const response = await app.inject({
        method: 'DELETE',
        url: '/me/daily-count',
        headers: { authorization: authHeader },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        message: 'Daily request counter reset',
        remaining: 10,
      });
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/me/daily-count' });
      expect(response.statusCode).toBe(401);
    });
  });
});
