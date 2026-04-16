import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { loggerPlugin } from './plugins/logger.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

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
  await fastify.register(swaggerPlugin, { version });

  fastify.get(
    '/version',
    {
      schema: {
        description: 'Returns the deployed application version',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              version: { type: 'string', example: '1.0.0' },
            },
          },
        },
      },
    },
    () => {
      return { version };
    },
  );

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
