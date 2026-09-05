/**
 * Un invité dont le lien a été RÉVOQUÉ reçoit un refus qui NOMME la cause (#4410).
 *
 * Quand un administrateur supprime un lien de partage, `revokeShareLinkGuests`
 * pose `Participant.isActive = false` sur chaque invité et coupe ses sockets.
 * C'est voulu. Mais l'appel REST suivant traversait `middleware/auth.ts` et
 * rendait un **401 nu** : l'invité ne pouvait pas distinguer « mon jeton est
 * invalide » (retaper le lien ?) de « l'accès m'a été retiré » (rien à faire),
 * et l'opérateur qui recevait son signalement ne le pouvait pas davantage.
 *
 * ## Ce que l'issue supposait, et ce que la mesure a montré
 *
 * L'issue pensait la distinction « déjà faite dans le code, seulement perdue à
 * la remontée ». Elle ne l'était pas : le `where` portait `isActive: true`,
 * donc un invité révoqué et un jeton INVENTÉ rendaient tous deux « aucune
 * ligne ». Le message d'erreur nommait les deux cas ; la requête ne les
 * séparait pas.
 *
 * Le correctif a donc DEUX moitiés, et la seconde est celle qu'on oublie :
 * sortir `isActive` du `where` pour pouvoir décider, puis faire TRAVERSER la
 * cause typée au `catch` intermédiaire qui uniformisait tout en « Invalid
 * session token ». Une erreur qu'on vient de qualifier ne survit pas à un
 * gestionnaire qui réécrit sans regarder.
 *
 * ## L'arbitrage de confidentialité
 *
 * Dire « ton accès a été retiré » confirme que le lien a EXISTÉ et que le
 * porteur y était admis. Acceptable, et pour une raison qui se mesure : seul un
 * jeton qui CORRESPOND à un participant réel obtient cette réponse — un jeton
 * inventé ne trouve aucune ligne et reçoit le 401 générique. L'information
 * n'est rendue qu'à quelqu'un qui détenait déjà la preuve de son admission.
 * Restent tus : par qui, quand, et quelle conversation.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
  logError: jest.fn(),
}));

import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

const JETON = 'jeton-de-session-invite';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';

function participant(isActive: boolean) {
  return {
    id: PARTICIPANT_ID,
    conversationId: '507f1f77bcf86cd799439022',
    type: 'anonymous',
    displayName: 'Invité',
    avatar: null,
    role: 'MEMBER',
    language: 'fr',
    permissions: null,
    isActive,
    isOnline: false,
    lastActiveAt: new Date(),
    nickname: null,
    anonymousSession: null,
  };
}

async function sonde(participantTrouve: unknown): Promise<FastifyInstance> {
  const prisma = {
    user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findFirst: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>() },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(participantTrouve),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  } as any;

  const app = Fastify({ logger: false });
  app.get(
    '/sonde',
    { preValidation: [createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: true })] },
    async (_req, reply) => reply.send({ ok: true })
  );
  await app.ready();
  return app;
}

describe('Invité révoqué — le refus nomme sa cause (#4410)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un participant DÉSACTIVÉ rend 410 GUEST_ACCESS_REVOKED, pas un 401 nu', async () => {
    const app = await sonde(participant(false));
    const res = await app.inject({
      method: 'GET',
      url: '/sonde',
      headers: { 'x-session-token': JETON },
    });
    await app.close();

    // La VALEUR SERVIE, en traversant le sérialiseur — `statusCode` seul n'est
    // pas une observation de la charge utile.
    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED' });
  });

  it('un jeton INVENTÉ garde le 401 générique — rien n\'est confirmé à qui ne détenait rien', async () => {
    const app = await sonde(null);
    const res = await app.inject({
      method: 'GET',
      url: '/sonde',
      headers: { 'x-session-token': 'jeton-qui-n-existe-pas' },
    });
    await app.close();

    // C'est CE témoin qui rend l'arbitrage de confidentialité défendable : la
    // cause n'est nommée qu'à un porteur de jeton réel.
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('GUEST_ACCESS_REVOKED');
  });

  it('un participant ACTIF passe — la garde vise la révocation, pas l\'invité', async () => {
    const app = await sonde(participant(true));
    const res = await app.inject({
      method: 'GET',
      url: '/sonde',
      headers: { 'x-session-token': JETON },
    });
    await app.close();

    // Sans ce témoin, une garde qui refuserait TOUT invité passerait les deux
    // précédents : ils n'exigent que des refus.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('la requête ne filtre plus sur `isActive` — sans quoi la distinction est impossible à faire', async () => {
    const prismaEspion = {
      user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      userSession: { findFirst: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>() },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(participant(false)),
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    } as any;

    const app = Fastify({ logger: false });
    app.get(
      '/sonde',
      { preValidation: [createUnifiedAuthMiddleware(prismaEspion, { requireAuth: true, allowAnonymous: true })] },
      async (_req, reply) => reply.send({ ok: true })
    );
    await app.ready();
    await app.inject({ method: 'GET', url: '/sonde', headers: { 'x-session-token': JETON } });
    await app.close();

    // Tant qu'`isActive: true` était dans le `where`, la distinction n'était
    // pas perdue à la remontée — elle n'était JAMAIS FAITE.
    const where = (prismaEspion.participant.findFirst as any).mock.calls[0][0].where;
    expect(where.isActive).toBeUndefined();
    expect(where.type).toBe('anonymous');
  });
});
