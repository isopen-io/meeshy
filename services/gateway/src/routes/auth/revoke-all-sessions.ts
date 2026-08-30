import jwt from 'jsonwebtoken';
import { AuthRouteContext } from './types';
import { invalidateAllSessions } from '../../services/SessionService';
import { disconnectRevokedSessions } from '../../socketio/disconnectRevokedSessions';

const JWT_SECRET = process.env.JWT_SECRET || 'meeshy-secret-key-dev';

interface RevokeAllPayload {
  userId: string;
  action: 'revoke-all';
}

export function registerRevokeAllSessionsRoute(context: AuthRouteContext) {
  const { fastify } = context;

  fastify.get<{ Querystring: { token: string } }>(
    // PAS de `/auth` ici : `route-registration.ts` monte déjà ce plugin sous
    // `${API_PREFIX}/auth`. Le déclarer produisait le chemin réel
    // `/api/v1/auth/auth/revoke-all-sessions`, quand l'e-mail « nouvelle
    // connexion détectée » envoie `/api/v1/auth/revoke-all-sessions`
    // (`NotificationService.ts:4931`) : le lien « ce n'était pas moi » était en
    // 404 — et c'est le SEUL site du dépôt qui coupe réellement les sockets
    // d'un intrus (#4141).
    '/revoke-all-sessions',
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

      // The page below says "All sessions disconnected". Until this call
      // existed it was false: the rows were invalidated, every live socket kept
      // streaming. This link is mailed on a suspicious login, so the socket an
      // intruder holds is precisely the one it exists to cut.
      await disconnectRevokedSessions({
        io: fastify.socketIOHandler?.getManager?.()?.getIO(),
        userId: payload.userId,
        reason: 'logout_all_devices',
        onError: (error) => fastify.log.warn({ err: error }, '[AUTH] socket fanout failed on revoke-all-sessions'),
      });

      reply.type('text/html').code(200);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>All sessions disconnected</h2><p>${count} session(s) have been revoked. Please log in again.</p><p><a href="https://meeshy.me" style="color:#6366F1">Go to Meeshy</a></p></body></html>`;
    }
  );
}
