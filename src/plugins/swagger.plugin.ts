import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const SWAGGER_ROUTE_PREFIX = '/docs';

const DESCRIPTION = `
Weather API with Google OAuth2, Redis cache, and Prometheus metrics.

**Authentication:** [Sign in with Google](/auth/google) — after login, session cookie handles auth automatically for all requests on this page.
`.trim();

export const swaggerPlugin = fp(async (fastify: FastifyInstance, options: { version: string }) => {
  await fastify.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: 'Fastify Meteo API',
        description: DESCRIPTION,
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
      persistAuthorization: true,
    },
  });
});
