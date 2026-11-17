/**
 * #19375 — « Mes cercles » : la passerelle sert le compte de CHAQUE cercle, Communauté comprise.
 *
 * `GET /relations` ne sert que les liens d'au moins Connaissance : la rangée « Mes cercles » lisait
 * toujours 0 en Communauté. `GET /relations/summary` sert un AGRÉGAT sans identité.
 *
 * Les témoins lisent l'état obtenu sur un double qui évalue les `where` (champ absent ≠ `null`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import Fastify from 'fastify';
import { registerRelationReads } from '../../../../routes/relations/read';
import { relationStore } from '../../../helpers/user-relation-store';
import { findManyIn, findUniqueIn, type MongoDocument } from '../../../helpers/mongo-where';
import { NOW, freezeClock, thawClock } from '../../../helpers/relation-app';

const MOI = '507f1f77bcf86cd799439011';
const AMI = '507f1f77bcf86cd799439022';
const voisin = (n: number) => `607f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;
const COMMU = 'cc0000000000000000000001';
const AUTRE_COMMU = 'cc0000000000000000000002';
const COMMU_FERMEE = 'cc0000000000000000000003';
const PREFIXE = '/api/v1/relations';

type Monde = {
  readonly comptes?: ReadonlyArray<MongoDocument>;
  readonly communautes?: ReadonlyArray<MongoDocument>;
  readonly membres?: ReadonlyArray<MongoDocument>;
  readonly liens?: ReadonlyArray<MongoDocument>;
  readonly demandes?: ReadonlyArray<MongoDocument>;
};

const compte = (id: string, extra: MongoDocument = {}): MongoDocument => ({
  id, role: 'USER', isActive: true, deletedAt: null, deactivatedAt: null, blockedUserIds: [], ...extra,
});
const communaute = (id: string, isActive = true): MongoDocument => ({ id, isActive });
const membre = (communityId: string, userId: string, isActive = true): MongoDocument => ({ communityId, userId, isActive });
const lienAmi = (a: string, b: string): MongoDocument => ({
  id: `aa${a.slice(-2)}${b.slice(-2)}00000000000000000000`,
  userLowId: a < b ? a : b,
  userHighId: a < b ? b : a,
  grantedByLow: 'FRIEND',
  grantedByHigh: 'FRIEND',
  origin: 'request',
  transitions: [],
  levelSince: new Date(NOW.getTime() - 100 * 86_400_000),
});
const demande = (id: string, senderId: string, receiverId: string, status = 'pending'): MongoDocument => ({
  id, senderId, receiverId, status, createdAt: NOW, updatedAt: NOW,
});

async function appli(monde: Monde) {
  const servis = monde.comptes ?? [];
  const comptes = servis.some((c) => c.id === MOI) ? servis : [compte(MOI), ...servis];
  const store = relationStore({ friendRequests: monde.demandes ?? [], relations: monde.liens ?? [] });
  const friendRows = (where: MongoDocument) => store.prisma.friendRequest.findMany({ where });
  const prisma = {
    user: { findMany: findManyIn(comptes).findMany, findUnique: findUniqueIn(comptes) },
    community: { findMany: findManyIn(monde.communautes ?? []).findMany },
    communityMember: { findMany: findManyIn(monde.membres ?? []).findMany },
    userRelation: store.prisma.userRelation,
    friendRequest: {
      ...store.prisma.friendRequest,
      count: async (args: { where: MongoDocument }) => (await friendRows(args.where)).length,
    },
    pairInteractionDay: { findMany: async () => [] },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: object) => { Object.assign(req, { user: { userId: MOI } }); });
  await app.register(async (scope) => registerRelationReads(scope), { prefix: PREFIXE });
  await app.ready();
  const call = async (url: string, headers: Record<string, string> = {}) => {
    const res = await app.inject({ method: 'GET', url, headers });
    return { status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : null };
  };
  return { call, close: () => app.close() };
}

const resume = async (monde: Monde) => {
  const app = await appli(monde);
  const res = await app.call(`${PREFIXE}/summary`);
  await app.close();
  return res;
};

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#19375 — GET /relations/summary : le cercle Communauté', () => {
  it('compte les co-membres actifs d’une communauté active que je partage, chacun une seule fois', async () => {
    const res = await resume({
      comptes: [compte(voisin(1)), compte(voisin(2))],
      communautes: [communaute(COMMU), communaute(AUTRE_COMMU)],
      membres: [
        membre(COMMU, MOI), membre(AUTRE_COMMU, MOI),
        membre(COMMU, voisin(1)), membre(AUTRE_COMMU, voisin(1)),
        membre(COMMU, voisin(2)),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      counts: { COMMUNITY: 2, ACQUAINTANCE: 0, FRIEND: 0, CLOSE: 0, BLOOD: 0 },
      pendingRequests: 0,
    });
  });

  it('un co-membre qui est aussi Ami se compte en Ami, jamais en Communauté', async () => {
    const res = await resume({
      comptes: [compte(AMI), compte(voisin(1))],
      communautes: [communaute(COMMU)],
      membres: [membre(COMMU, MOI), membre(COMMU, AMI), membre(COMMU, voisin(1))],
      liens: [lienAmi(MOI, AMI)],
    });

    expect(res.body.data.counts).toEqual({ COMMUNITY: 1, ACQUAINTANCE: 0, FRIEND: 1, CLOSE: 0, BLOOD: 0 });
  });

  it('écarte le bloqué (dans les deux sens), le compte désactivé, supprimé ou inactif, le membre parti et la communauté fermée', async () => {
    const res = await resume({
      comptes: [
        compte(MOI, { blockedUserIds: [voisin(1)] }),
        compte(voisin(1)),
        compte(voisin(2), { blockedUserIds: [MOI] }),
        compte(voisin(3), { deactivatedAt: new Date(NOW.getTime() - 1000) }),
        compte(voisin(4), { deletedAt: new Date(NOW.getTime() - 1000) }),
        compte(voisin(5), { isActive: false }),
        compte(voisin(6)),
        compte(voisin(7)),
        compte(voisin(8)),
        compte(voisin(9)),
      ],
      communautes: [communaute(COMMU), communaute(COMMU_FERMEE, false), communaute(AUTRE_COMMU)],
      membres: [
        membre(COMMU, MOI), membre(COMMU_FERMEE, MOI),
        ...[1, 2, 3, 4, 5].map((n) => membre(COMMU, voisin(n))),
        membre(COMMU, voisin(6), false),
        membre(COMMU_FERMEE, voisin(7)),
        membre(AUTRE_COMMU, voisin(8)),
        membre(COMMU, voisin(9)),
      ],
    });

    expect(res.body.data.counts.COMMUNITY).toBe(1);
  });

  it('un membre parti de toutes ses communautés n’atteint plus personne au cercle Communauté', async () => {
    const res = await resume({
      comptes: [compte(voisin(1))],
      communautes: [communaute(COMMU)],
      membres: [membre(COMMU, MOI, false), membre(COMMU, voisin(1))],
    });

    expect(res.body.data.counts.COMMUNITY).toBe(0);
  });

  it('ne sert aucun identifiant, aucun nom, aucune présence : un agrégat et rien à côté', async () => {
    const res = await resume({
      comptes: [compte(AMI), compte(voisin(1))],
      communautes: [communaute(COMMU)],
      membres: [membre(COMMU, MOI), membre(COMMU, AMI), membre(COMMU, voisin(1))],
      liens: [lienAmi(MOI, AMI)],
      demandes: [demande('dd0000000000000000000001', voisin(1), MOI)],
    });

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain(AMI);
    expect(serialised).not.toContain(voisin(1));
    expect(serialised).not.toContain(COMMU);
    expect(serialised).not.toMatch(/isOnline|lastActiveAt|username|displayName|userId/i);
    expect(Object.keys(res.body.data).sort()).toEqual(['counts', 'pendingRequests']);
  });
});

describe('#19375 — GET /relations/summary : les autres cercles et les demandes', () => {
  it('les cercles d’au moins Connaissance sont la répartition exacte de GET /relations', async () => {
    const app = await appli({ comptes: [compte(AMI)], liens: [lienAmi(MOI, AMI)] });
    const liste = await app.call(PREFIXE);
    const res = await app.call(`${PREFIXE}/summary`);
    await app.close();

    const parNiveau = (liste.body.data as Array<{ effectiveLevel: string }>).filter((l) => l.effectiveLevel === 'FRIEND').length;
    expect(res.body.data.counts.FRIEND).toBe(parNiveau);
    expect(parNiveau).toBe(1);
  });

  it('pendingRequests compte les demandes REÇUES en attente, hors blocage — ni envoyées, ni tranchées', async () => {
    const res = await resume({
      comptes: [compte(MOI, { blockedUserIds: [voisin(4)] }), compte(voisin(1)), compte(voisin(2)), compte(voisin(3)), compte(voisin(4))],
      demandes: [
        demande('dd0000000000000000000001', voisin(1), MOI),
        demande('dd0000000000000000000002', voisin(2), MOI),
        demande('dd0000000000000000000003', MOI, voisin(3)),
        demande('dd0000000000000000000004', voisin(3), MOI, 'accepted'),
        demande('dd0000000000000000000005', voisin(4), MOI),
      ],
    });

    expect(res.body.data.pendingRequests).toBe(2);
  });

  it('sert un ETag, et un 304 sans corps quand rien n’a changé', async () => {
    const monde: Monde = { comptes: [compte(voisin(1))], communautes: [communaute(COMMU)], membres: [membre(COMMU, MOI), membre(COMMU, voisin(1))] };
    const app = await appli(monde);
    const premier = await app.call(`${PREFIXE}/summary`);
    const second = await app.call(`${PREFIXE}/summary`, { 'if-none-match': String(premier.headers.etag) });
    await app.close();

    expect(premier.headers.etag).toEqual(expect.stringMatching(/^"[0-9a-f]{64}"$/));
    expect(second.status).toBe(304);
    expect(second.body).toBeNull();
  });

  it('GET /relations reste inchangé : aucun co-membre de communauté n’y entre', async () => {
    const app = await appli({ comptes: [compte(voisin(1))], communautes: [communaute(COMMU)], membres: [membre(COMMU, MOI), membre(COMMU, voisin(1))] });
    const liste = await app.call(PREFIXE);
    await app.close();

    expect(liste.body.data).toEqual([]);
  });
});
