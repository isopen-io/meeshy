/**
 * `GET /relations/:userId` — le niveau EFFECTIF du lien du lecteur avec une
 * personne, et RIEN de plus (#13998, spec cercles § 4).
 *
 * Le double Prisme honore la clé de paire : ce que la route lit passe par
 * `niveauEffectif` (site unique), jamais par une comparaison locale. La réponse
 * est comparée à l'IDENTIQUE (`toEqual`) : un champ de plus — un second niveau,
 * un identifiant de demande, un drapeau de blocage — ferait rougir le témoin.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { relationLevelResponseSchema } from '@meeshy/shared/types/relation-level-response';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { relationsLevelRoutes } from '../../../../routes/relations/level';

const PREFIXE = '/api/v1/relations';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd7994390ff';
const INCONNU = '507f1f77bcf86cd799439abc';

const [LOW, HIGH] = [MOI, AUTRE].sort();

type Monde = {
  readonly niveaux?: { readonly low: string; readonly high: string };
  readonly bloques?: ReadonlyArray<{ readonly id: string; readonly bloque: string }>;
};

function prismaDouble({ niveaux, bloques = [] }: Monde) {
  const user = {
    findFirst: jest.fn<any>(async (args: any) => {
      const or: ReadonlyArray<{ id: string; blockedUserIds: { has: string } }> = args.where.OR;
      const trouve = bloques.find((b) => or.some((c) => c.id === b.id && c.blockedUserIds.has === b.bloque));
      return trouve ? { id: trouve.id } : null;
    }),
  };
  const userRelation = {
    findUnique: jest.fn<any>(async (args: any) => {
      const cle = args.where.userLowId_userHighId;
      if (!niveaux || cle.userLowId !== LOW || cle.userHighId !== HIGH) return null;
      return {
        id: 'rel-1',
        userLowId: LOW,
        userHighId: HIGH,
        grantedByLow: niveaux.low,
        grantedByHigh: niveaux.high,
        transitions: [],
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      };
    }),
  };
  const friendRequest = { findFirst: jest.fn<any>(async () => null) };
  return { user, userRelation, friendRequest };
}

async function monter(monde: Monde = {}, { authentifie = true }: { authentifie?: boolean } = {}) {
  const prisma = prismaDouble(monde);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authentifie) return reply.code(401).send({ success: false, error: 'Authentication required' });
    req.authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });
  await app.register(relationsLevelRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma };
}

const lire = (app: Awaited<ReturnType<typeof monter>>['app'], id: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/${id}` });

describe('GET /relations/:userId', () => {
  it('sert FRIEND pour un ami, et UNIQUEMENT userId et effectiveLevel', async () => {
    const { app } = await monter({ niveaux: { low: 'FRIEND', high: 'FRIEND' } });

    const res = await lire(app, AUTRE);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { userId: AUTRE, effectiveLevel: 'FRIEND' } });
    await app.close();
  });

  it('sert CLOSE pour un proche', async () => {
    const { app } = await monter({ niveaux: { low: 'CLOSE', high: 'CLOSE' } });

    expect((await lire(app, AUTRE)).json().data).toEqual({ userId: AUTRE, effectiveLevel: 'CLOSE' });
    await app.close();
  });

  it("sert le MINIMUM des deux accords : aucun accès à sens unique (RG-01)", async () => {
    const { app } = await monter({ niveaux: { low: 'CLOSE', high: 'ACQUAINTANCE' } });

    expect((await lire(app, AUTRE)).json().data.effectiveLevel).toBe('ACQUAINTANCE');
    await app.close();
  });

  it("sert PUBLIC pour quelqu'un qu'aucun lien ne relie", async () => {
    const { app } = await monter();

    expect((await lire(app, AUTRE)).json().data).toEqual({ userId: AUTRE, effectiveLevel: 'PUBLIC' });
    await app.close();
  });

  it('sert PUBLIC quand le lecteur a BLOQUÉ la personne, malgré un lien proche', async () => {
    const { app } = await monter({
      niveaux: { low: 'CLOSE', high: 'CLOSE' },
      bloques: [{ id: MOI, bloque: AUTRE }],
    });

    expect((await lire(app, AUTRE)).json().data).toEqual({ userId: AUTRE, effectiveLevel: 'PUBLIC' });
    await app.close();
  });

  it('sert PUBLIC quand la personne a BLOQUÉ le lecteur — dans les deux sens', async () => {
    const { app } = await monter({
      niveaux: { low: 'CLOSE', high: 'CLOSE' },
      bloques: [{ id: AUTRE, bloque: MOI }],
    });

    expect((await lire(app, AUTRE)).json().data).toEqual({ userId: AUTRE, effectiveLevel: 'PUBLIC' });
    await app.close();
  });

  it("sert PUBLIC pour un utilisateur inconnu, sous la MÊME forme qu'un inconnu sans lien", async () => {
    const { app } = await monter({ niveaux: { low: 'FRIEND', high: 'FRIEND' } });

    const inconnu = await lire(app, INCONNU);

    expect(inconnu.statusCode).toBe(200);
    expect(inconnu.json()).toEqual({ success: true, data: { userId: INCONNU, effectiveLevel: 'PUBLIC' } });
    await app.close();
  });

  it("emprunte le MÊME chemin de lecture pour un bloqué, un inconnu et un ami — aucun oracle", async () => {
    const monde: Monde = { niveaux: { low: 'FRIEND', high: 'FRIEND' }, bloques: [{ id: MOI, bloque: INCONNU }] };
    const comptes: number[][] = [];
    for (const cible of [AUTRE, INCONNU]) {
      const { app, prisma } = await monter(monde);
      await lire(app, cible);
      comptes.push([prisma.user.findFirst.mock.calls.length, prisma.userRelation.findUnique.mock.calls.length]);
      await app.close();
    }

    expect(comptes[1]).toEqual(comptes[0]);
  });

  it('refuse (400) de lire son PROPRE lien, sans interroger la base', async () => {
    const { app, prisma } = await monter();

    const res = await lire(app, MOI);

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    expect(prisma.userRelation.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['pas-un-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', `${AUTRE}0`])(
    "refuse (400) l'identifiant %s qui n'est pas un ObjectId, sans interroger la base",
    async (id) => {
      const { app, prisma } = await monter();

      const res = await lire(app, id);

      expect(res.statusCode).toBe(400);
      expect(prisma.userRelation.findUnique).not.toHaveBeenCalled();
      await app.close();
    }
  );

  it('refuse (401) un appelant non authentifié ou anonyme, sans interroger la base', async () => {
    const { app, prisma } = await monter({ niveaux: { low: 'CLOSE', high: 'CLOSE' } }, { authentifie: false });

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/${AUTRE}`, headers: { 'x-session-token': 'jeton-invite' } });

    expect(res.statusCode).toBe(401);
    expect(prisma.userRelation.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it("n'accepte pas un contexte authentifié SANS compte inscrit (invité de lien)", async () => {
    const prisma = prismaDouble({ niveaux: { low: 'CLOSE', high: 'CLOSE' } });
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as never);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, type: 'anonymous', userId: MOI, registeredUser: null };
    });
    await app.register(relationsLevelRoutes, { prefix: PREFIXE });
    await app.ready();

    expect((await lire(app, AUTRE)).statusCode).toBe(401);
    expect(prisma.userRelation.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert une charge que le schéma Zod partagé relit à l’identique', async () => {
    const { app } = await monter({ niveaux: { low: 'BLOOD', high: 'BLOOD' } });

    const { data } = (await lire(app, AUTRE)).json();

    expect(relationLevelResponseSchema.parse(data)).toEqual(data);
    await app.close();
  });

  it('ne rend un 500 que pour une panne de lecture, sans détail interne', async () => {
    const { app, prisma } = await monter();
    prisma.userRelation.findUnique.mockRejectedValueOnce(new Error('mongo: secret interne'));

    const res = await lire(app, AUTRE);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret interne');
    await app.close();
  });
});
