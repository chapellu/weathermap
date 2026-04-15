import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export const loggerPlugin = fp(async (fastify: FastifyInstance) => {
  // Pino logger is configured at app build time via the logger option.
  // This hook enriches each request log with method and url at entry point.
  fastify.addHook('onRequest', (request, _reply, done) => {
    request.log.info({ method: request.method, url: request.url }, 'incoming request');
    done();
  });
});
