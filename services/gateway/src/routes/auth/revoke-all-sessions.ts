import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
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
      // Ce plafond compte l'ADRESSE, et c'est une DÉCISION — pas l'héritage
      // silencieux qu'il était. `mergeParams` d'@fastify/rate-limit est un
      // `Object.assign` (`index.js:190`) : un littéral sans `keyGenerator`
      // prenait celui des paramètres globaux (`global:${request.ip}`), donc
      // comptait déjà par adresse, mais sans que rien ne le dise ni ne
      // l'empêche de suivre le jour où le global compterait autre chose.
      //
      // Pourquoi l'adresse et non le compte, alors que le lot #4685 fait
      // l'inverse sur `POST /invitations/email` — trois raisons :
      //
      //  1. Il n'y a AUCUN appelant connu avant le handler. Cette route ne
      //     monte pas de garde d'authentification : elle prend un JWT en
      //     querystring et le vérifie elle-même. Le dériver dans le
      //     `keyGenerator` obligerait à `jwt.verify` une entrée entièrement
      //     choisie par l'appelant, à chaque requête, AVANT tout plafond — le
      //     limiteur deviendrait l'amplificateur qu'il borne.
      //  2. La population à freiner n'a pas de compte : ce qu'on borne est une
      //     rafale de jetons INVALIDES. Un jeton valide signifie que le
      //     destinataire légitime a cliqué son lien.
      //  3. Une route qui déclare `config.rateLimit` n'a PLUS le limiteur
      //     global — `onRoute` (`index.js:174`) monte le sien à la place,
      //     jamais en plus. Ce plafond est donc le seul rempart par adresse
      //     de cette route.
      //
      // Ce que le choix cède : deux victimes derrière une même sortie NAT qui
      // cliquent leur lien dans la même minute se partagent les cinq essais.
      //
      // `hook: 'onRequest'` est écrit plutôt que laissé au défaut du plugin :
      // c'est la phase où l'on VEUT compter ici, y compris les requêtes qu'un
      // schéma rejettera — un flot sans `token` est le même abus.
      //
      // `skipOnError: true` (le global le posait, sans qu'on l'ait choisi) :
      // ce lien est le SEUL site du dépôt qui coupe réellement les sockets
      // d'un intrus (#4141). L'échec fermé répondrait 500 à la victime pendant
      // une panne du magasin de compteurs, et laisserait l'intrus connecté.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'onRequest' as const,
          skipOnError: true,
          keyGenerator: (request: FastifyRequest) => `revoke-all-sessions:ip:${request.ip}`,
          errorResponseBuilder: () => ({
            success: false,
            statusCode: 429,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many attempts (auth/revoke-all-sessions). Please try again later.',
            },
          }),
        },
      },
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
