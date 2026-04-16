import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const SWAGGER_ROUTE_PREFIX = '/docs';

export const swaggerPlugin = fp(async (fastify: FastifyInstance, options: { version: string }) => {
  await fastify.register(swagger, {
    transform: jsonSchemaTransform,
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
    routePrefix: SWAGGER_ROUTE_PREFIX,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Workaround for @fastify/swagger-ui v5 bug: @fastify/static is registered inside the
  // /docs scope but its URL-stripping logic only checks for '/static' (not '/docs/static').
  // Stripping the route prefix from req.raw.url before the handler runs fixes this.
  fastify.addHook('preHandler', async (request) => {
    const url = request.raw.url;
    if (url && url.startsWith(`${SWAGGER_ROUTE_PREFIX}/static/`)) {
      request.raw.url = url.slice(SWAGGER_ROUTE_PREFIX.length);
    }
  });
});
