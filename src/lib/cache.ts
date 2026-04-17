import Redis from 'ioredis';
import { env } from '@/lib/env.js';

export const CACHE_TTL_GEO = 24 * 60 * 60; // 24h in seconds
export const CACHE_TTL_WEATHER = 10 * 60; // 10min in seconds

let redisClient: Redis | null = null;

function getClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  redisClient ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
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

export async function cacheDelete(key: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // Redis unavailable — ignore
  }
}

function buildDailyKey(email: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `daily:${email}:${today}`;
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function getDailyCount(email: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    const raw = await client.get(buildDailyKey(email));
    return raw ? Number.parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementDailyCount(email: string): Promise<number> {
  const client = getClient();
  if (!client) return 1;
  try {
    const key = buildDailyKey(email);
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, secondsUntilMidnightUtc());
    }
    return count;
  } catch {
    return 1;
  }
}

export async function resetDailyCount(email: string): Promise<void> {
  await cacheDelete(buildDailyKey(email));
}

export async function closeCache(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
