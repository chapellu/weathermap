import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OwmApiError, OwmCityNotFoundError } from '../lib/owm-client.js';
import {
  DAILY_REQUEST_LIMIT,
  DailyLimitExceededError,
  GeoRestrictedError,
  getForecast,
  getWeather,
  invalidateWeatherCache,
} from '../lib/weather.service.js';

const WeatherQuerySchema = z.object({
  city: z.string().min(1).max(100).trim().describe('City name to look up'),
});

const WeatherResponseSchema = z.object({
  city: z.string(),
  country: z.string().describe('ISO 3166-1 alpha-2 country code'),
  temp: z.number().describe('Temperature in Celsius'),
  feels_like: z.number().describe('Feels-like temperature in Celsius'),
  humidity: z.number().describe('Humidity percentage (0–100)'),
  wind_speed: z.number().describe('Wind speed in m/s'),
  description: z.string().describe('Short weather description (e.g. "clear sky")'),
});

const ForecastItemSchema = z.object({
  dt_txt: z.string().describe('Forecast slot timestamp (UTC, format: YYYY-MM-DD HH:mm:ss)'),
  temp: z.number().describe('Temperature in Celsius'),
  feels_like: z.number().describe('Feels-like temperature in Celsius'),
  humidity: z.number().describe('Humidity percentage (0–100)'),
  wind_speed: z.number().describe('Wind speed in m/s'),
  description: z.string().describe('Short weather description'),
});

const ForecastResponseSchema = z.object({
  city: z.string(),
  country: z.string().describe('ISO 3166-1 alpha-2 country code'),
  list: z.array(ForecastItemSchema).describe('Forecast slots in 3-hour intervals over 5 days'),
});

const ErrorSchema = z.object({ message: z.string() });

function handleWeatherError(
  error: unknown,
  fastify: {
    httpErrors: {
      notFound: (msg: string) => Error;
      badGateway: (msg: string) => Error;
      forbidden: (msg: string) => Error;
    };
  },
): never {
  if (error instanceof OwmCityNotFoundError) throw fastify.httpErrors.notFound(error.message);
  if (error instanceof OwmApiError) throw fastify.httpErrors.badGateway(error.message);
  if (error instanceof GeoRestrictedError) throw fastify.httpErrors.forbidden(error.message);
  if (error instanceof DailyLimitExceededError) throw fastify.httpErrors.forbidden(error.message);
  throw error;
}

export const weatherRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/weather',
    {
      preHandler: [fastify.authenticate, fastify.authorize('weather:read:current')],
      schema: {
        description: [
          'Returns current weather conditions for a city.',
          '\n\n**Free-plan restrictions:**',
          `\n- **Geographic limit** — only cities in Europe are available`,
          `\n- **Daily limit** — capped at ${DAILY_REQUEST_LIMIT} requests per day (resets at midnight UTC). Remaining requests are returned in the \`X-RateLimit-Remaining\` header.`,
          '\n\nUpgrade to `pro` via `PATCH /me/plan` to lift both restrictions.',
          '\n\nCache status is reported via the `X-Cache-Status` response header (`HIT` or `MISS`).',
        ].join(''),
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        querystring: WeatherQuerySchema,
        response: {
          200: WeatherResponseSchema,
          400: ErrorSchema.describe('Missing or invalid `city` query parameter'),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Geographic restriction or daily limit exceeded'),
          404: ErrorSchema.describe('City not found'),
          502: ErrorSchema.describe('Upstream OpenWeatherMap API error'),
        },
      },
    },
    async (req, reply) => {
      const { city } = req.query;
      try {
        const { data, cacheStatus, remainingRequests } = await getWeather(city, req.user);
        reply.header('X-Cache-Status', cacheStatus);
        reply.header('X-RateLimit-Limit', DAILY_REQUEST_LIMIT);
        if (remainingRequests !== null) {
          reply.header('X-RateLimit-Remaining', remainingRequests);
        }
        return data;
      } catch (error) {
        handleWeatherError(error, fastify);
      }
    },
  );

  app.get(
    '/weather/forecast',
    {
      preHandler: [fastify.authenticate, fastify.authorize('weather:read:forecast')],
      schema: {
        description: [
          'Returns a 5-day weather forecast in 3-hour slots for a city.',
          '\n\n**Requires `pro` plan or `admin` role.**.',
          '\n\nUpgrade your plan via `PATCH /me/plan`.',
          '\n\nCache status is reported via the `X-Cache-Status` response header (`HIT` or `MISS`).',
        ].join(''),
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        querystring: WeatherQuerySchema,
        response: {
          200: ForecastResponseSchema,
          400: ErrorSchema.describe('Missing or invalid `city` query parameter'),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Insufficient plan — requires `pro` or `admin` role'),
          404: ErrorSchema.describe('City not found'),
          502: ErrorSchema.describe('Upstream OpenWeatherMap API error'),
        },
      },
    },
    async (req, reply) => {
      const { city } = req.query;
      try {
        const { data, cacheStatus } = await getForecast(city, req.user);
        reply.header('X-Cache-Status', cacheStatus);
        return data;
      } catch (error) {
        handleWeatherError(error, fastify);
      }
    },
  );

  app.post(
    '/weather/cache/invalidate',
    {
      preHandler: [fastify.authenticate, fastify.authorize('weather:cache:invalidate')],
      schema: {
        description:
          'Invalidate the geo, weather, and forecast cache entries for a city. **Admin only.**',
        tags: ['Weather'],
        security: [{ bearerAuth: [] }],
        querystring: WeatherQuerySchema,
        response: {
          200: z.object({ message: z.string() }),
          401: ErrorSchema.describe('Missing or invalid Bearer token'),
          403: ErrorSchema.describe('Requires `admin` role'),
        },
      },
    },
    async (req) => {
      const { city } = req.query;
      await invalidateWeatherCache(city);
      return { message: `Cache invalidated for city: ${city}` };
    },
  );
};
