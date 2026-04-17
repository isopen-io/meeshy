import jwt from 'jsonwebtoken';
import { AuthRouteContext } from './types';
import { invalidateAllSessions } from '../../services/SessionService';

const JWT_SECRET = process.env.JWT_SECRET || 'meeshy-secret-key-dev';

interface RevokeAllPayload {
  userId: string;
  action: 'revoke-all';
}

export function registerRevokeAllSessionsRoute(context: AuthRouteContext) {
  const { fastify } = context;

  fastify.get<{ Querystring: { token: string } }>(
    '/auth/revoke-all-sessions',
    {
      schema: {
        description: 'Revoke all sessions for a user via signed email link',
        tags: ['auth'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { token } = request.query;

      let payload: RevokeAllPayload;
      try {
        payload = jwt.verify(token, JWT_SECRET) as RevokeAllPayload;
      } catch {
        reply.type('text/html').code(400);
        return '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Link expired or invalid</h2><p>This security link has expired. Please log in to manage your sessions.</p></body></html>';
      }

      if (payload.action !== 'revoke-all' || !payload.userId) {
        reply.type('text/html').code(400);
        return '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invalid link</h2></body></html>';
      }

      const count = await invalidateAllSessions(payload.userId, undefined, 'email_revoke_all');
      reply.type('text/html').code(200);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>All sessions disconnected</h2><p>${count} session(s) have been revoked. Please log in again.</p><p><a href="https://meeshy.me" style="color:#6366F1">Go to Meeshy</a></p></body></html>`;
    }
  );
}
