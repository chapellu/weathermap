import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { loggerPlugin } from './plugins/logger.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';
import { weatherRoutes } from './routes/weather.js';
import { closeCache } from './lib/cache.js';

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

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(sensible);
  await fastify.register(loggerPlugin);
  await fastify.register(swaggerPlugin, { version });
  await fastify.register(weatherRoutes);

  fastify.addHook('onClose', async () => {
    await closeCache();
  });

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/version',
    {
      schema: {
        description: 'Returns the deployed application version',
        tags: ['System'],
        response: {
          200: z.object({ version: z.string() }),
        },
      },
    },
    () => ({ version }),
  );

  app.get(
    '/healthz',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: z.object({ status: z.string() }),
        },
      },
    },
    () => ({ status: 'ok' }),
  );

  return fastify;
}
