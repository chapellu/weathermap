import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getDailyCount, resetDailyCount } from '../lib/cache.js';
import { DAILY_REQUEST_LIMIT } from '../lib/weather.service.js';

const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: z
    .enum(['viewer', 'admin'])
    .describe('`admin` unlocks admin routes and forecast regardless of plan'),
  plan: z
    .enum(['free', 'pro'])
    .describe('`pro` unlocks forecast and removes geographic and daily-limit restrictions'),
});

const PlanBodySchema = z.object({
  plan: z
    .enum(['free', 'pro'])
    .describe(
      '`free` — European countries only, 10 requests/day max, no forecast. ' +
        '`pro` — global cities, unlimited requests, forecast endpoint unlocked.',
    ),
});

const ErrorSchema = z.object({ message: z.string() });

export const meRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description:
          'Returns the profile of the currently authenticated user, including their plan and role.',
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: {
          200: UserSchema,
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
        },
      },
    },
    async (req) => {
      const [user] = await db.select().from(users).where(eq(users.email, req.user.email)).limit(1);
      if (!user) throw fastify.httpErrors.notFound('User not found');
      return user;
    },
  );

  app.patch(
    '/me/plan',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: [
          'Update your own subscription plan.',
          '\n\n- `free` — restricted to European cities, capped at 10 requests/day, no forecast access.',
          '\n- `pro` — global cities, unlimited requests, forecast endpoint unlocked.',
        ].join(''),
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        body: PlanBodySchema,
        response: {
          200: UserSchema,
          400: ErrorSchema.describe('Invalid plan value — must be `free` or `pro`'),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
        },
      },
    },
    async (req) => {
      const [updated] = await db
        .update(users)
        .set({ plan: req.body.plan })
        .where(eq(users.email, req.user.email))
        .returning();
      if (!updated) throw fastify.httpErrors.notFound('User not found');
      return updated;
    },
  );

  app.delete(
    '/me/daily-count',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: [
          'Reset your daily request counter to zero.',
          `\n\n**Demo only** — lets you immediately restore your full ${DAILY_REQUEST_LIMIT} requests/day allowance without waiting for midnight UTC.`,
          '\n\nHas no effect for `pro` users or admins (they have no limit).',
        ].join(''),
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            message: z.string(),
            remaining: z
              .number()
              .describe(`Requests remaining today (always ${DAILY_REQUEST_LIMIT} after reset)`),
          }),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
        },
      },
    },
    async (req) => {
      await resetDailyCount(req.user.email);
      const remaining = await getDailyCount(req.user.email);
      return {
        message: 'Daily request counter reset',
        remaining: DAILY_REQUEST_LIMIT - remaining,
      };
    },
  );
};
