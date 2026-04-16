import { SignJWT } from 'jose';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long!!';

export const TEST_USER = {
  email: 'test@example.com',
  role: 'viewer',
  plan: 'free',
};

export async function generateTestToken(email = TEST_USER.email): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}
