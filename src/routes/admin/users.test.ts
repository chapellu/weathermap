import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../index.js';
import { generateTestToken } from '../../test/helpers/auth.helper.js';
import { setupDbSelectUser } from '../../test/helpers/mocks.js';

vi.mock('../../lib/env.js');
vi.mock('ioredis');

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../db/client.js', () => ({ db: mockDb }));

const ADMIN_USER = { id: 1, email: 'admin@example.com', role: 'admin', plan: 'pro' };
const VIEWER_USER = { id: 2, email: 'viewer@example.com', role: 'viewer', plan: 'free' };

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Admin users routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    adminToken = `Bearer ${await generateTestToken(ADMIN_USER.email)}`;
    viewerToken = `Bearer ${await generateTestToken(VIEWER_USER.email)}`;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/users', () => {
    it('returns 200 with user list for admin', async () => {
      // Given
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([ADMIN_USER]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([ADMIN_USER, VIEWER_USER]),
        });

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: adminToken },
      });

      // Then
      expect(response.statusCode).toBe(200);
    });

    it('returns 403 for a viewer', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);

      // When
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: viewerToken },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without token', async () => {
      // When
      const response = await app.inject({ method: 'GET', url: '/admin/users' });

      // Then
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /admin/users/:id/plan', () => {
    it('returns 200 and updated user for admin', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);
      const updatedUser = { ...VIEWER_USER, plan: 'pro' };
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
        url: '/admin/users/2/plan',
        headers: { authorization: adminToken, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ plan: 'pro' });
    });

    it('returns 403 for a viewer', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);

      // When
      const response = await app.inject({
        method: 'PATCH',
        url: '/admin/users/2/plan',
        headers: { authorization: viewerToken, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });

      // Then
      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /admin/users/:id/role', () => {
    it('returns 200 and updated user for admin', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);
      const updatedUser = { ...VIEWER_USER, role: 'admin' };
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
        url: '/admin/users/2/role',
        headers: { authorization: adminToken, 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ role: 'admin' });
    });
  });

  describe('DELETE /admin/users/:id', () => {
    it('returns 200 for admin', async () => {
      // Given
      setupDbSelectUser(mockDb, ADMIN_USER);
      mockDb.delete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([VIEWER_USER]),
        }),
      });

      // When
      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/users/2',
        headers: { authorization: adminToken },
      });

      // Then
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ message: 'User deleted' });
    });

    it('returns 403 for viewer', async () => {
      // Given
      setupDbSelectUser(mockDb, VIEWER_USER);

      // When
      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/users/2',
        headers: { authorization: viewerToken },
      });

      // Then
      expect(response.statusCode).toBe(403);
    });
  });
});
