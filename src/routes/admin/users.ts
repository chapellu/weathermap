import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';

const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: z.enum(['viewer', 'admin']).describe('User role'),
  plan: z.enum(['free', 'pro']).describe('Subscription plan'),
});

const IdParamsSchema = z.object({
  id: z.coerce.number().int().positive().describe('User ID'),
});

const PlanBodySchema = z.object({
  plan: z
    .enum(['free', 'pro'])
    .describe('`free` — restricted access. `pro` — global cities, unlimited, forecast unlocked.'),
});

const RoleBodySchema = z.object({
  role: z
    .enum(['viewer', 'admin'])
    .describe('`viewer` — standard user. `admin` — full access to all endpoints.'),
});

const ErrorSchema = z.object({ message: z.string() });

export const adminUsersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const preHandler = [fastify.authenticate, fastify.authorize('admin:manage:users')];

  app.get(
    '/admin/users',
    {
      preHandler,
      schema: {
        description: 'List all registered users. **Admin only.**',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(UserSchema),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
        },
      },
    },
    async () => {
      return db.select().from(users);
    },
  );

  app.get(
    '/admin/users/:id',
    {
      preHandler,
      schema: {
        description: 'Get a single user by ID. **Admin only.**',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: IdParamsSchema,
        response: {
          200: UserSchema,
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
          404: ErrorSchema.describe('User not found'),
        },
      },
    },
    async (req) => {
      const [user] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!user) throw fastify.httpErrors.notFound('User not found');
      return user;
    },
  );

  app.patch(
    '/admin/users/:id/plan',
    {
      preHandler,
      schema: {
        description: 'Update the subscription plan for any user. **Admin only.**',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: IdParamsSchema,
        body: PlanBodySchema,
        response: {
          200: UserSchema,
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
          404: ErrorSchema.describe('User not found'),
        },
      },
    },
    async (req) => {
      const [updated] = await db
        .update(users)
        .set({ plan: req.body.plan })
        .where(eq(users.id, req.params.id))
        .returning();
      if (!updated) throw fastify.httpErrors.notFound('User not found');
      return updated;
    },
  );

  app.patch(
    '/admin/users/:id/role',
    {
      preHandler,
      schema: {
        description: 'Update the role for any user. **Admin only.**',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: IdParamsSchema,
        body: RoleBodySchema,
        response: {
          200: UserSchema,
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
          404: ErrorSchema.describe('User not found'),
        },
      },
    },
    async (req) => {
      const [updated] = await db
        .update(users)
        .set({ role: req.body.role })
        .where(eq(users.id, req.params.id))
        .returning();
      if (!updated) throw fastify.httpErrors.notFound('User not found');
      return updated;
    },
  );

  app.delete(
    '/admin/users/:id',
    {
      preHandler,
      schema: {
        description: 'Permanently delete a user by ID. **Admin only.**',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: IdParamsSchema,
        response: {
          200: z.object({ message: z.string() }),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
          404: ErrorSchema.describe('User not found'),
        },
      },
    },
    async (req) => {
      const [deleted] = await db.delete(users).where(eq(users.id, req.params.id)).returning();
      if (!deleted) throw fastify.httpErrors.notFound('User not found');
      return { message: 'User deleted' };
    },
  );
};
