import Fastify from 'fastify';
import { loggerPlugin } from './plugins/logger.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : { target: 'pino-logfmt' },
    },
  });

  await fastify.register(loggerPlugin);
  await fastify.register(swaggerPlugin);

  fastify.get(
    '/healthz',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
            },
          },
        },
      },
    },
    () => {
      return { status: 'ok' };
    },
  );

  return fastify;
}
