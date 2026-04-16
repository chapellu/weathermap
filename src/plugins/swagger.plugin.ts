import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export const swaggerPlugin = fp(async (fastify: FastifyInstance, options: { version: string }) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Fastify Meteo API',
        description: 'Weather API with Google OAuth2, ABAC, Redis cache, and Prometheus metrics',
        version: options.version,
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });
});
