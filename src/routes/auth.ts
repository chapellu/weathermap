import type { FastifyPluginAsync } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { env } from '../lib/env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

const SCOPES = ['openid', 'email'];

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/auth/google',
    {
      schema: {
        description: 'Redirect to Google OAuth2 consent screen',
        tags: ['Auth'],
      },
    },
    async (req, reply) => {
      const redirectUri = `${req.protocol}://${String(req.headers['host'])}/auth/callback`;
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
      const authUrl = client.generateAuthUrl({ access_type: 'online', scope: SCOPES });
      return reply.redirect(authUrl);
    },
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

      const redirectUri = `${req.protocol}://${String(req.headers['host'])}/auth/callback`;
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
        maxAge: 3600,
      });

      return reply.redirect('/docs');
    },
  );
};
