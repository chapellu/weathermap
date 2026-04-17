import { Registry, Counter, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const cacheHitCounter = new Counter({
  name: 'weather_cache_hit_total',
  help: 'Total number of weather cache hits',
  registers: [registry],
});

export const cacheMissCounter = new Counter({
  name: 'weather_cache_miss_total',
  help: 'Total number of weather cache misses',
  registers: [registry],
});
