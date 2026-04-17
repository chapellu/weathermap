import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { evaluateAdminPolicy } from '../policies/admin.policy.js';
import { evaluateWeatherPolicy } from '../policies/weather.policy.js';

const DENY_MESSAGES: Record<string, string> = {
  'weather:read:forecast':
    'This endpoint requires a pro plan or admin role. Upgrade via PATCH /me/plan.',
  'weather:cache:invalidate': 'This endpoint requires admin role.',
  'admin:manage:users': 'This endpoint requires admin role.',
};

function evaluatePolicy(action: string, user: { role: string; plan: string }): 'allow' | 'deny' {
  try {
    if (evaluateWeatherPolicy(action, user) === 'allow') return 'allow';
    if (evaluateAdminPolicy(action, user) === 'allow') return 'allow';
    return 'deny';
  } catch {
    return 'deny';
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authorize',
    (action: string) =>
      async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (evaluatePolicy(action, req.user) === 'deny') {
          const message = DENY_MESSAGES[action] ?? 'Forbidden';
          await reply.status(403).send({ message });
        }
      },
  );
};

export const permissionsPlugin = fp(plugin);
