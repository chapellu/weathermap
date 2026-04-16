import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getWeather } from '../lib/weather.service.js';
import { OwmCityNotFoundError, OwmApiError } from '../lib/owm-client.js';

const WeatherQuerySchema = z.object({
  city: z.string().min(1).max(100).trim(),
});

const WeatherResponseSchema = z.object({
  city: z.string(),
  country: z.string(),
  temp: z.number(),
  feels_like: z.number(),
  humidity: z.number(),
  wind_speed: z.number(),
  description: z.string(),
});

export const weatherRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/weather',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get current weather for a city',
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        querystring: WeatherQuerySchema,
        response: {
          200: WeatherResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const { city } = req.query;
      try {
        const { data, cacheStatus } = await getWeather(city);
        reply.header('X-Cache-Status', cacheStatus);
        return data;
      } catch (error) {
        if (error instanceof OwmCityNotFoundError) {
          throw fastify.httpErrors.notFound(error.message);
        }
        if (error instanceof OwmApiError) {
          throw fastify.httpErrors.badGateway(error.message);
        }
        throw error;
      }
    },
  );
};
