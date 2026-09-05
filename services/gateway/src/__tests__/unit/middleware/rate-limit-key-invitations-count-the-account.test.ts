/**
 * `POST /invitations/email` — « 10 invitations par heure » compte-t-il un COMPTE ?
 *
 * ## Le défaut, et pourquoi il ne se voit pas en lisant la route
 *
 * La route déclarait un littéral NU :
 *
 *     config: { rateLimit: { max: 10, timeWindow: '1 hour' } }
 *
 * `mergeParams` d'@fastify/rate-limit est un `Object.assign`
 * (`index.js:190`) : toute clé absente de la config de route est prise sur
 * les paramètres GLOBAUX. `registerGlobalRateLimiter`
 * (`middleware/rate-limiter.ts`) y pose `keyGenerator: () => \`global:${ip}\``.
 * Le plafond s'appliquait donc par ADRESSE — un plafond horaire manifestement
 * pensé par compte, et faux dans les deux sens : plusieurs comptes derrière
 * une sortie NAT se partagent dix invitations, un même compte disposant de
 * plusieurs adresses en obtient dix par adresse.
 *
 * Ce que la route NE partageait PAS, contrairement à ce qu'on lit parfois :
 * le seau du limiteur global. `RedisStore.prototype.child` préfixe par
 * `` `${method}${url}-` `` et `LocalStore.child` fabrique une LRU neuve —
 * chaque route a son seau. Le défaut était la CLÉ, rien d'autre.
 *
 * ## Pourquoi DEUX comptes, et pourquoi un seul ne prouve rien
 *
 * À UN seul compte, la version « par adresse » et la version « par compte »
 * rendent le MÊME verdict : les dix premiers appels passent, le onzième est
 * refusé. Un témoin posé là ne peut pas tomber. C'est le verdict du SECOND
 * compte qui porte toute la preuve — et c'est exactement le symptôme de
 * production, deux comptes derrière une même sortie.
 *
 * ## Pourquoi le VRAI middleware d'authentification, et pas un double
 *
 * La question du lot était : « que porte `request` au hook du limiteur sur
 * CETTE route ? ». Un double qui pose `authContext` lui-même répond à la
 * question par son énoncé. Le harnais monte donc
 * `createUnifiedAuthMiddleware` — ce que `server.ts:752` décore sous le nom
 * `authenticate` — et un JWT réellement signé.
 *
 * Mesure obtenue (2026-09-01), et elle a une conséquence contre-intuitive :
 * sur cette route, `authContext` est présent AUX TROIS placements de hook,
 * `onRequest` par défaut COMPRIS. `addRouteRateHook` (`index.js:236`) fait
 * `routeOptions[hook].push(hookHandler)` quand le tableau existe déjà ; la
 * route déclarant `onRequest: [fastify.authenticate]`, le limiteur est
 * APPENDU derrière l'authentification, dans le même tableau. La clé par
 * compte y serait donc calculable même sans `hook: 'preHandler'` — par
 * ACCIDENT d'ordonnancement, non par construction. Le hook est posé quand
 * même : il rend la propriété indépendante de la forme sous laquelle la
 * route monte sa garde, et il est le motif déjà mesuré du dépôt (#4347).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { invitationRoutes } from '../../../routes/invitations';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { createInvitationRateLimitConfig } from '../../../middleware/rate-limit';

const COMPTE_A = '507f1f77bcf86cd799439011';
const COMPTE_B = '507f1f77bcf86cd7994390b2';

const MAX = createInvitationRateLimitConfig().max;

function ligneUtilisateur(id: string) {
  return {
    id,
    username: `u-${id.slice(-4)}`,
    email: `${id.slice(-4)}@meeshy.test`,
    displayName: `U ${id.slice(-4)}`,
    avatar: null,
    role: 'USER',
    isActive: true,
    firstName: null,
    lastName: null,
    bio: null,
    banner: null,
    phoneNumber: null,
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    isOnline: true,
    lastActiveAt: new Date(),
    emailVerifiedAt: null,
    deviceLocale: null,
    profileCompletionRate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function prismaDouble() {
  return {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ligneUtilisateur(where.id)),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    userSession: { findFirst: jest.fn(async () => ({ isValid: true })) },
  };
}

function jeton(compte: string): string {
  return jwt.sign(
    { userId: compte, username: `u-${compte.slice(-4)}`, sid: `sess-${compte.slice(-4)}` },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

/**
 * Monte la route RÉELLE sur le VRAI plugin, avec les paramètres globaux
 * VIVANTS (`registerGlobalRateLimiter`, `server.ts`) — c'est leur
 * `keyGenerator` qu'un littéral nu hérite par `Object.assign`, et sans lui le
 * harnais mesurerait un défaut qu'il aurait lui-même supprimé.
 */
async function verdictsParCompte(
  appels: ReadonlyArray<readonly [compte: string, nombre: number]>
): Promise<Record<string, number[]>> {
  const app = Fastify({ logger: false });
  const prisma = prismaDouble();

  app.decorate('prisma', prisma as unknown);
  app.decorate(
    'authenticate',
    createUnifiedAuthMiddleware(prisma as never, { requireAuth: true, allowAnonymous: false })
  );
  (app as unknown as Record<string, unknown>).emailService = {
    sendInvitationEmail: jest.fn(async () => undefined),
  };

  await app.register(rateLimit, {
    global: false,
    skipOnError: true,
    keyGenerator: (request) => `global:${request.ip}`,
  });
  await app.register(invitationRoutes);
  await app.ready();

  const verdicts: Record<string, number[]> = {};
  for (const [compte, nombre] of appels) {
    verdicts[compte] = [];
    for (let i = 0; i < nombre; i += 1) {
      const reponse = await app.inject({
        method: 'POST',
        url: '/invitations/email',
        headers: { authorization: `Bearer ${jeton(compte)}` },
        payload: { email: `invite-${compte.slice(-4)}-${i}@ailleurs.test` },
      });
      verdicts[compte].push(reponse.statusCode);
    }
  }

  await app.close();
  return verdicts;
}

describe("Deux comptes ne partagent jamais le crédit d'invitations", () => {
  it("le compte qui épuise son crédit ne prive pas son voisin d'adresse", async () => {
    const verdicts = await verdictsParCompte([
      [COMPTE_A, MAX + 1],
      [COMPTE_B, MAX],
    ]);

    expect(verdicts[COMPTE_A].slice(0, MAX)).toEqual(Array(MAX).fill(201));
    expect(verdicts[COMPTE_A][MAX]).toBe(429);

    // LA preuve : B n'a rien consommé, il doit disposer de son crédit ENTIER.
    // Sous le littéral nu, il reçoit 429 dès son premier appel parce que A a
    // vidé le seau de l'ADRESSE qu'ils partagent.
    expect(verdicts[COMPTE_B]).toEqual(Array(MAX).fill(201));
  }, 30_000);
});

describe('La config du geste déclare ce qu\'elle fait, au lieu de l\'hériter', () => {
  const config = createInvitationRateLimitConfig() as unknown as Record<string, unknown>;

  it('pose le hook — la CAUSE, pas seulement le symptôme de la clé', () => {
    expect(config.hook).toBe('preHandler');
  });

  /**
   * `registerGlobalRateLimiter` pose `skipOnError: true`, valeur GLOBALE
   * fusionnée par `Object.assign` dans toute config qui ne la redéclare pas.
   * Ce geste fait partir un e-mail vers une adresse que l'APPELANT choisit :
   * un Redis indisponible ne doit pas en faire une primitive d'envoi sans
   * plafond. Même arbitrage que `createContactChangeRateLimitConfig`.
   */
  it("échoue FERMÉ — la panne du gardien n'est pas l'absence de garde", () => {
    expect(Object.prototype.hasOwnProperty.call(config, 'skipOnError')).toBe(true);
    expect(config.skipOnError).toBe(false);
  });

  it('le refus porte son 429, et le format d\'erreur du dépôt', () => {
    const corps = (config.errorResponseBuilder as () => Record<string, unknown>)();
    expect(corps.statusCode).toBe(429);
    expect(corps.error).toEqual({ code: 'RATE_LIMIT_EXCEEDED', message: expect.any(String) });
  });
});
