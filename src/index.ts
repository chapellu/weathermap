import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { closeCache } from '@/lib/cache.js';
import { authPlugin } from '@/plugins/auth.plugin.js';
import { loggerPlugin } from '@/plugins/logger.plugin.js';
import { metricsPlugin } from '@/plugins/metrics.plugin.js';
import { permissionsPlugin } from '@/plugins/permissions.plugin.js';
import { swaggerPlugin } from '@/plugins/swagger.plugin.js';
import { adminUsersRoutes } from '@/routes/admin/users.js';
import { authRoutes } from '@/routes/auth.js';
import { meRoutes } from '@/routes/me.js';
import { weatherRoutes } from '@/routes/weather.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

export async function buildApp() {
  const fastify = Fastify({
    trustProxy: true,
    logger: {
      transport:
        process.env.NODE_ENV === 'production'
          ? { target: 'pino-logfmt' }
          : {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
    },
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(sensible);
  await fastify.register(fastifyCookie);
  await fastify.register(loggerPlugin);
  await fastify.register(swaggerPlugin, { version });
  await fastify.register(authPlugin);
  await fastify.register(permissionsPlugin);
  await fastify.register(metricsPlugin);
  await fastify.register(authRoutes);
  await fastify.register(weatherRoutes);
  await fastify.register(meRoutes);
  await fastify.register(adminUsersRoutes);

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
