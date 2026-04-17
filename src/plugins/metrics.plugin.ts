import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { env } from '../lib/env.js';
import { registry } from '../lib/metrics.js';

export const metricsPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Prometheus metrics endpoint — requires Bearer METRICS_TOKEN',
        tags: ['System'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (authHeader !== `Bearer ${env.METRICS_TOKEN}`) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const metrics = await registry.metrics();
      return reply.code(200).header('Content-Type', registry.contentType).send(metrics);
    },
  );
});
