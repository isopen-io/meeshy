/**
 * @jest-environment node
 *
 * LES GARDES HÉRITÉES DE `middleware/auth.ts` DISENT LAQUELLE DES DEUX (#4760).
 *
 * `requireRole` et `requireEmailVerification` refusaient DEUX situations
 * structurellement différentes — « il n'y a pas de session » et « la session
 * vaut, mais pas pour ceci » — avec la MÊME réponse : `403 PERMISSION_DENIED`.
 * Seule la prose anglaise du `message` les séparait.
 *
 * POURQUOI CE TÉMOIN MONTE UNE VRAIE ROUTE. Appeler la garde avec un `reply`
 * simulé ne prouverait que la moitié : le second défaut vit dans le
 * SÉRIALISEUR. Les cinq routes de `routes/maintenance.ts` — les seules que
 * `requireAdmin` garde, avec les quatre adresses de `socketio-admin-routes.ts`
 * — déclarent `401`/`403: errorResponseSchema`, qui déclare `error` en
 * `string`. La forme imbriquée `{ error: { code, message } }` que les gardes
 * posaient en sortait, MESURÉ, en `{"success":false,"error":"[object Object]"}` :
 * `code` supprimé, phrase détruite. Ce témoin lit donc le corps tel qu'il SORT
 * DU FIL, à travers le schéma réel, et derrière la garde RÉELLE — un témoin
 * monté sur une route non gardée passerait pour la mauvaise raison.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    del: jest.fn(async () => {}),
    isAvailable: jest.fn(() => false),
  })),
  resetCacheStore: jest.fn(),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { requireAdmin, requireEmailVerification } from '../../../middleware/auth';

type Garde = (request: FastifyRequest, reply: never) => Promise<void>;

/**
 * Le contexte que `createUnifiedAuthMiddleware` aurait posé. Il est injecté par
 * un `onRequest` ANTÉRIEUR à la garde, dans l'ordre exact de la production :
 * l'authentification d'abord, la garde ensuite.
 */
const monterRoute = async (garde: unknown, contexte: unknown): Promise<FastifyInstance> => {
  const app = Fastify();

  app.get(
    '/protegee',
    {
      onRequest: [
        async (request) => {
          (request as unknown as { authContext: unknown }).authContext = contexte;
        },
        garde as Garde,
      ],
      schema: {
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' } } },
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async () => ({ success: true })
  );

  await app.ready();
  return app;
};

const appeler = async (garde: unknown, contexte: unknown) => {
  const app = await monterRoute(garde, contexte);
  try {
    const reponse = await app.inject({ method: 'GET', url: '/protegee' });
    return { statut: reponse.statusCode, corps: reponse.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
};

const SESSION_ABSENTE = null;
const SESSION_ANONYME = { isAuthenticated: false, registeredUser: null };
const MEMBRE_SANS_LE_ROLE = { isAuthenticated: true, registeredUser: { role: 'USER' } };
const ADMIN = { isAuthenticated: true, registeredUser: { role: 'ADMIN' } };

describe('requireRole — une session ABSENTE et un rôle INSUFFISANT ne sont pas le même refus', () => {
  it.each([
    ['aucun authContext', SESSION_ABSENTE],
    ['un authContext non authentifié', SESSION_ANONYME],
  ])('rend 401 UNAUTHORIZED quand il n\'y a pas de session (%s)', async (_cas, contexte) => {
    const { statut, corps } = await appeler(requireAdmin, contexte);

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  it('rend 403 PERMISSION_DENIED quand la session vaut mais que le rôle ne suffit pas', async () => {
    const { statut, corps } = await appeler(requireAdmin, MEMBRE_SANS_LE_ROLE);

    expect(statut).toBe(403);
    expect(corps.code).toBe('PERMISSION_DENIED');
  });

  it('laisse passer le rôle admis', async () => {
    const { statut, corps } = await appeler(requireAdmin, ADMIN);

    expect(statut).toBe(200);
    expect(corps.success).toBe(true);
  });

  /**
   * LE CODE EST LE SIGNAL, PAS LA PROSE. Les deux refus doivent être
   * discernables par une valeur MACHINE : c'est tout ce qu'un client peut
   * brancher, et c'est ce qui manquait.
   */
  it('sert deux codes DIFFÉRENTS pour les deux refus', async () => {
    const sansSession = await appeler(requireAdmin, SESSION_ABSENTE);
    const roleTropBas = await appeler(requireAdmin, MEMBRE_SANS_LE_ROLE);

    expect(sansSession.corps.code).not.toBe(roleTropBas.corps.code);
    expect(sansSession.statut).not.toBe(roleTropBas.statut);
  });

  /**
   * LA PHRASE SURVIT AU SÉRIALISEUR. `errorResponseSchema` déclare `error` en
   * `string` ; la forme imbriquée d'avant en sortait en `"[object Object]"`.
   */
  it.each([
    ['sans session', SESSION_ABSENTE],
    ['avec un rôle trop bas', MEMBRE_SANS_LE_ROLE],
  ])('sert une phrase lisible, jamais « [object Object] » (%s)', async (_cas, contexte) => {
    const { corps } = await appeler(requireAdmin, contexte);

    expect(corps.error).not.toBe('[object Object]');
    expect(typeof corps.error).toBe('string');
    expect(corps.message).toEqual(expect.any(String));
  });
});

/**
 * LE REFUS RESTE FERMÉ QUAND LA LECTURE DU CONTEXTE ÉCHOUE. Le `try` de
 * `requireRole` ne rattrape plus un `throw` à nous — les deux refus sortent par
 * retour anticipé — mais la LECTURE d'`authContext`, qu'un accesseur défaillant
 * peut faire échouer. Un tel incident doit refuser, jamais laisser passer.
 * Porté depuis `auth-extended.test.ts` avec les describes ci-dessus (#4760).
 */
describe('requireRole — quand la lecture du contexte échoue', () => {
  it('refuse en 403 PERMISSION_DENIED, jamais en laissez-passer', async () => {
    const { statut, corps } = await appeler(requireAdmin, {
      isAuthenticated: true,
      get registeredUser(): never {
        throw new TypeError('Unexpected internal failure');
      },
    });

    expect(statut).toBe(403);
    expect(corps.code).toBe('PERMISSION_DENIED');
  });
});

describe('requireEmailVerification — même distinction', () => {
  it.each([
    ['aucun authContext', SESSION_ABSENTE],
    ['un authContext non authentifié', SESSION_ANONYME],
  ])('rend 401 UNAUTHORIZED quand il n\'y a pas de session (%s)', async (_cas, contexte) => {
    const { statut, corps } = await appeler(requireEmailVerification, contexte);

    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });

  it('rend 403 EMAIL_NOT_VERIFIED quand la session vaut mais que l\'e-mail ne l\'est pas', async () => {
    const { statut, corps } = await appeler(requireEmailVerification, {
      isAuthenticated: true,
      registeredUser: { emailVerifiedAt: null },
    });

    expect(statut).toBe(403);
    expect(corps.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('laisse passer un e-mail vérifié', async () => {
    const { statut } = await appeler(requireEmailVerification, {
      isAuthenticated: true,
      registeredUser: { emailVerifiedAt: new Date() },
    });

    expect(statut).toBe(200);
  });
});
