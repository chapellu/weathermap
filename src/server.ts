import { buildApp } from '@/index.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = await buildApp();
await app.listen({ port: PORT, host: '0.0.0.0' });
