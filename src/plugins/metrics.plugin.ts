import type { FastifyInstance } from 'fastify';
import fastifyMetrics from 'fastify-metrics';
import fp from 'fastify-plugin';
import { Registry } from 'prom-client';
import { customRegistry } from '@/lib/metrics.js';

export const metricsPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyMetrics, {
    clearRegisterOnInit: true,
    endpoint: null,
  });

  fastify.get(
    '/metrics',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Prometheus metrics — requires JWT auth',
        tags: ['System'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const merged = Registry.merge([customRegistry, fastify.metrics.client.register]);
      const output = await merged.metrics();
      return reply.code(200).header('Content-Type', merged.contentType).send(output);
    },
  );
});
