export type {};

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      email: string;
      role: string;
      plan: string;
    };
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signToken: (email: string) => Promise<string>;
  }
}
