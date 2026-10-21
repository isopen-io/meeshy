import type { FastifyRequest } from 'fastify';
import { AuthRouteContext } from './types';
import { invalidateAllSessions } from '../../services/SessionService';
import { disconnectRevokedSessions } from '../../socketio/disconnectRevokedSessions';
import { logWarn } from '../../utils/logger';
import { getJwtSecret } from '../../utils/secrets';
import { verifyRevokeAllLinkToken } from '../../services/auth/revoke-all-link-token';
import { sendError, sendSuccess } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

const JWT_SECRET = getJwtSecret();

// Une config PARTAGÉE par le `GET` (e-mails déjà partis) et le `POST` (#10859).
// Chaque porte garde son seau (le magasin préfixe la clé par méthode et
// chemin) : 5 + 5 essais par minute et par adresse, sans conséquence — le jeton
// signé ne se devine pas.
//
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
//     monte pas de garde d'authentification : elle prend un JWT (requête ou corps)
//     et le vérifie elle-même. Le dériver dans le
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
const REVOKE_ALL_SESSIONS_ROUTE_CONFIG = {
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
};

export function registerRevokeAllSessionsRoute(context: AuthRouteContext) {
  const { fastify } = context;

  async function revokeEverySessionOf(token: string): Promise<number | null> {
    // #10493 — le jeton du lien n'est vérifiable qu'ici : clé dérivée et
    // audience propres, l'ancienne forme des e-mails déjà partis comprise.
    const payload = verifyRevokeAllLinkToken(token, JWT_SECRET);
    if (!payload) return null;

    const count = await invalidateAllSessions(payload.userId, undefined, 'email_revoke_all');

    // The confirmation says "All sessions disconnected". Until this call
    // existed it was false: the rows were invalidated, every live socket kept
    // streaming. This link is mailed on a suspicious login, so the socket an
    // intruder holds is precisely the one it exists to cut.
    await disconnectRevokedSessions({
      io: fastify.socketIOHandler?.getManager?.()?.getIO(),
      userId: payload.userId,
      reason: 'logout_all_devices',
      onError: (error) => logWarn(fastify.log, '[AUTH] socket fanout failed on revoke-all-sessions', error),
    });
    return count;
  }

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
      config: REVOKE_ALL_SESSIONS_ROUTE_CONFIG,
    },
    async (request, reply) => {
      const count = await revokeEverySessionOf(request.query.token);
      if (count === null) {
        reply.type('text/html').code(400);
        return '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Link expired or invalid</h2><p>This security link has expired. Please log in to manage your sessions.</p></body></html>';
      }
      reply.type('text/html').code(200);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>All sessions disconnected</h2><p>${count} session(s) have been revoked. Please log in again.</p><p><a href="https://meeshy.me" style="color:#6366F1">Go to Meeshy</a></p></body></html>`;
    }
  );

  // #10859 — le lien NEUF : la page web (`/auth/revoke-sessions`) lit le jeton
  // dans le FRAGMENT de son adresse et le remet ici, dans le CORPS. Aucune
  // adresse journalisée ne le porte, et seul un CLIC humain déclenche l'appel.
  // Le `GET` ci-dessus reste pour les e-mails déjà partis (jeton valable 24 h).
  fastify.post<{ Body: { token: string } }>(
    '/revoke-all-sessions',
    {
      schema: {
        description: 'Revoke all sessions for a user via the signed email link token (body)',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 1 } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', properties: { revokedCount: { type: 'number' } } },
            },
          },
          400: errorResponseSchema,
        },
      },
      config: REVOKE_ALL_SESSIONS_ROUTE_CONFIG,
    },
    async (request, reply) => {
      const count = await revokeEverySessionOf(request.body?.token ?? '');
      if (count === null) {
        return sendError(reply, 400, 'This security link has expired or is invalid', { code: 'INVALID_OR_EXPIRED_LINK' });
      }
      return sendSuccess(reply, { revokedCount: count });
    }
  );
}
