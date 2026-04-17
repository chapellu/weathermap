import { z } from 'zod';

const EnvSchema = z.object({
  OPENWEATHER_API_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  METRICS_TOKEN: z.string().min(16),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = EnvSchema.parse(process.env);
