import { vi } from 'vitest';

export const mockRedis = {
  get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  quit: vi.fn().mockResolvedValue('OK'),
};

// Must use a regular function so `new Redis(url)` works as a constructor
export default vi.fn(function MockRedis() {
  return mockRedis;
});
