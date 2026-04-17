import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export const loggerPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', (request, _reply, done) => {
    request.log.info({ method: request.method, url: request.url }, 'incoming request');
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const fields: Record<string, unknown> = {
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      duration: Math.round(reply.elapsedTime),
    };

    const cacheStatus = reply.getHeader('X-Cache-Status');
    if (typeof cacheStatus === 'string') {
      fields['cache'] = cacheStatus.toLowerCase();
    }

    const user = (request as FastifyRequest & { user?: { email: string } }).user;
    if (user?.email) {
      fields['user'] = user.email;
    }

    request.log.info(fields, 'request completed');
    done();
  });
});
