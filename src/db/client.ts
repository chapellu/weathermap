import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema.js';
import { env } from '@/lib/env.js';

const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });
