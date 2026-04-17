import { Registry, Counter } from 'prom-client';

export const customRegistry = new Registry();

export const cacheHitCounter = new Counter({
  name: 'weather_cache_hit_total',
  help: 'Total number of weather cache hits',
  registers: [customRegistry],
});

export const cacheMissCounter = new Counter({
  name: 'weather_cache_miss_total',
  help: 'Total number of weather cache misses',
  registers: [customRegistry],
});
