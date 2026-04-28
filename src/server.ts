import { buildApp } from '@/index.js';
import { config } from '@/lib/config.js';
import { env } from '@/lib/env.js';

const PORT = env.PORT ?? config.server.port;

const app = await buildApp();
await app.listen({ port: PORT, host: '0.0.0.0' });
