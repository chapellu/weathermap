import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 50 }).notNull().default('viewer').$type<'viewer' | 'admin'>(),
  plan: varchar('plan', { length: 50 }).notNull().default('free').$type<'free' | 'pro'>(),
});
