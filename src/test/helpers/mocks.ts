import { vi } from 'vitest';

export type MockDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

export function setupDbSelectUser(
  mockDb: MockDb,
  user: { id: number; email: string; role: string; plan: string },
) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([user]),
      }),
    }),
  });
}
