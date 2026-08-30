/**
 * Le lien « ce n'était pas moi » mène quelque part (#4141).
 *
 * `registerRevokeAllSessionsRoute` déclarait '/auth/revoke-all-sessions' sur
 * une instance que route-registration.ts monte DÉJÀ sous /api/v1/auth. Le
 * chemin réel était donc /api/v1/auth/AUTH/revoke-all-sessions — avec le
 * segment « auth » DEUX fois — quand NotificationService.ts:4931 envoie, dans
 * l'e-mail « nouvelle connexion détectée », /api/v1/auth/revoke-all-sessions.
 *
 * Ce n'est pas un détail de routage : cette route est le SEUL site du dépôt qui
 * appelle `disconnectRevokedSessions`. Les trois autres chemins de révocation
 * (`DELETE /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/logout`)
 * passent la ligne `UserSession` à `isValid: false` sans couper aucun socket.
 * La seule révocation qui déconnecte réellement un intrus était donc celle dont
 * l'URL n'existait pas.
 *
 * Le témoin monte le plugin avec le préfixe RÉEL de la production et injecte
 * l'URL que l'e-mail contient. C'est le seul montage qui puisse voir ce défaut :
 * un test qui enregistre la route sans préfixe la trouve toujours.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

jest.mock('../../../services/SessionService', () => ({
  invalidateAllSessions: jest.fn<any>().mockResolvedValue(3),
}));

const disconnect = jest.fn<any>().mockResolvedValue(2);
jest.mock('../../../socketio/disconnectRevokedSessions', () => ({
  disconnectRevokedSessions: (...a: any[]) => disconnect(...a),
}));

import { registerRevokeAllSessionsRoute } from '../../../routes/auth/revoke-all-sessions';

const JWT_SECRET = process.env.JWT_SECRET || 'meeshy-secret-key-dev';
const USER_ID = '507f1f77bcf86cd799439011';

/** Le préfixe que `route-registration.ts` applique à `authRoutes`. */
const PREFIXE_PRODUCTION = '/api/v1/auth';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  await app.register(
    async (instance) => {
      registerRevokeAllSessionsRoute({ fastify: instance } as any);
    },
    { prefix: PREFIXE_PRODUCTION }
  );
  await app.ready();
  return app;
}

describe('GET /api/v1/auth/revoke-all-sessions — le chemin que l’e-mail envoie', () => {
  it('répond à l’URL exacte que NotificationService compose', async () => {
    const app = await buildApp();
    const token = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, JWT_SECRET);

    const res = await app.inject({
      method: 'GET',
      // Copié de NotificationService.ts:4931 — `${apiBase}/api/v1/auth/revoke-all-sessions?token=…`
      url: `/api/v1/auth/revoke-all-sessions?token=${token}`,
    });

    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(200);
    // Et la promesse de la page — « toutes les sessions déconnectées » — est tenue.
    expect(disconnect).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('n’est PAS servie sous le chemin doublé', async () => {
    const app = await buildApp();
    const token = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, JWT_SECRET);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/auth/revoke-all-sessions?token=${token}`,
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
