import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { jwtVerify, SignJWT } from 'jose';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { env } from '../lib/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('signToken', async (email: string): Promise<string> => {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(secret);
  });

  fastify.decorate(
    'authenticate',
    async (
      req: Parameters<typeof fastify.authenticate>[0],
      reply: Parameters<typeof fastify.authenticate>[1],
    ): Promise<void> => {
      try {
        const authHeader = req.headers.authorization;
        let token: string | undefined;

        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.slice(7);
        } else if (req.cookies?.token) {
          token = req.cookies.token;
        }

        if (!token) {
          throw new Error('No token provided');
        }

        const { payload } = await jwtVerify(token, secret);
        const email = payload.email;

        if (typeof email !== 'string') {
          throw new Error('Invalid token payload');
        }

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (!user) {
          throw new Error('User not found');
        }

        req.user = { email: user.email, role: user.role, plan: user.plan };
      } catch {
        await reply.status(401).send({ message: 'Unauthorized' });
      }
    },
  );
};

export const authPlugin = fp(plugin);
