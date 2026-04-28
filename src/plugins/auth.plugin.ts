import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { OAuth2Client } from 'google-auth-library';
import { jwtVerify, SignJWT } from 'joste';
import { db } from '@/db/client.js';
import { users } from '@/db/schema.js';
import { config } from '@/lib/config.js';
import { env } from '@/lib/env.js';

export interface AuthPluginOptions {
  secret: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  const secret = new TextEncoder().encode(opts.secret);

  fastify.decorate('signToken', async (email: string): Promise<string> => {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: config.jwt.algorithm })
      .setExpirationTime(config.jwt.expirationTime)
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

    fastify.get(
      '/auth/google',
      {
        schema: {
          description: 'Redirect to Google OAuth2 consent screen',
          tags: ['Auth'],
        },
      },
      async (req, reply) => {
        const redirectUri = `${req.protocol}://${String(req.headers.host)}/auth/callback`;
        const client = new OAuth2Client(
          env.GOOGLE_CLIENT_ID,
          env.GOOGLE_CLIENT_SECRET,
          redirectUri,
        );
        const authUrl = client.generateAuthUrl({
          access_type: 'online',
          scope: [...config.oauth.scopes],
        });
        return reply.redirect(authUrl);
      },
    ),
  );

  fastify.get(
    '/auth/callback',
    {
      schema: {
        description: 'Google OAuth2 callback — exchanges code for JWT',
        tags: ['Auth'],
      },
    },
    async (req, reply) => {
      const { code } = req.query as { code?: string };

      if (!code) {
        throw fastify.httpErrors.badRequest('Missing OAuth2 code');
      }

      const redirectUri = `${req.protocol}://${String(req.headers.host)}/auth/callback`;
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

      const { tokens } = await client.getToken(code);
      const idToken = tokens.id_token;

      if (!idToken) {
        throw fastify.httpErrors.badGateway('No id_token returned by Google');
      }

      const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
      const email = ticket.getPayload()?.email;

      if (!email) {
        throw fastify.httpErrors.badGateway('No email in Google token payload');
      }

      await db.insert(users).values({ email }).onConflictDoNothing({ target: users.email });

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!user) {
        throw fastify.httpErrors.internalServerError('Failed to upsert user');
      }

      const token = await fastify.signToken(email);

      reply.setCookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: config.cookie.maxAge,
      });

      return reply.redirect('/');
    },
  );
};

export const authPlugin = fp(plugin);
