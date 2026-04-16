import Redis from 'ioredis';
import { env } from './env.js';

export const CACHE_TTL_GEO = 24 * 60 * 60; // 24h in seconds
export const CACHE_TTL_WEATHER = 10 * 60; // 10min in seconds

let redisClient: Redis | null = null;

function getClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  }
  return redisClient;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Redis unavailable — degrade to cache miss
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Redis unavailable — continue without caching
  }
}

export async function closeCache(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
