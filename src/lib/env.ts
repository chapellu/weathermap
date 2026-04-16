import { z } from 'zod';

const EnvSchema = z.object({
  OPENWEATHER_API_KEY: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = EnvSchema.parse(process.env);
