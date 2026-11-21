/**
 * Une acceptation vérifiée « entrée » n'est plus relue (#20003).
 *
 * `reopenOrphanedAcceptances` (#19924) relisait, à chaque première page de la
 * liste des demandes, jusqu'à 50 acceptations des 30 derniers jours et les
 * appartenances de leurs demandeurs : les acceptations LÉGITIMES restant
 * `accepted`, ce travail se rejouait à chaque ouverture, et une orpheline plus
 * ancienne que les 50 plus récentes n'était jamais vue par la liste.
 *
 * Une acceptation dont le sort est SCELLÉ porte désormais `entryVerifiedAt` :
 *  - écrite à l'entrée (acceptation suivie de l'appartenance, clôture d'une
 *    demande par une autre porte) ;
 *  - écrite par la réparation quand elle relit une acceptation qu'elle ne
 *    rouvrira jamais (personne entrée, demande plus récente) — une preuve
 *    d'entrée ne se défait pas : une ligne active ne redevient pas « quittée
 *    avant la décision ».
 * La réparation ne relit que les acceptations NON scellées (champ nul OU
 * absent : les lignes d'avant ce lot se scellent à leur première relecture).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const admitCommunityMember = jest.fn<any>();
jest.mock('../../../../routes/communities/admission', () => ({
  ...jest.requireActual<any>('../../../../routes/communities/admission'),
  admitCommunityMember: (...args: unknown[]) => admitCommunityMember(...args),
}));

import { registerEntryRoutes } from '../../../../routes/communities/entries';
import {
  ORPHAN_ACCEPTANCE_GRACE_MS,
  closePendingJoinRequests,
  reopenOrphanedAcceptances,
} from '../../../../services/community-join-request-lifecycle';

const ADMIN = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const NOW = new Date('2026-11-21T08:00:00Z');
const LATER = new Date(NOW.getTime() + 3_600_000);

const hex = (n: number) => n.toString(16).padStart(24, '0');

type Request = {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  entryVerifiedAt?: Date | null;
};
type Member = { userId: string; isActive: boolean; leftAt: Date | null };

const unsealed = (r: Request) => r.entryVerifiedAt === null || r.entryVerifiedAt === undefined;

/** Un magasin en mémoire qui APPLIQUE les filtres et les écritures que la réparation lui remet. */
function makeStore(input: { readonly requests: Request[]; readonly members: Member[] }) {
  const requests = input.requests.map((r) => ({ ...r }));
  const members = input.members;
  const matches = (r: Request, where: any): boolean =>
    Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'OR') return cond.some((alt: any) => matches(r, alt));
      const value = (r as any)[key];
      if (key === 'entryVerifiedAt') {
        if (cond === null) return value === null;
        if (cond?.isSet === false) return value === undefined;
      }
      if (cond === null) return value === null || value === undefined;
      if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
      if (typeof cond === 'object') {
        if ('in' in cond) return cond.in.includes(value);
        if ('lte' in cond) return value !== null && value <= cond.lte;
        if ('gte' in cond) return value !== null && value >= cond.gte;
        if ('lt' in cond) return value !== null && value < cond.lt;
      }
      return value === cond;
    });
  const memberReads = jest.fn<any>(async ({ where }: any) =>
    members.filter(
      (m) =>
        (where.userId?.in ? where.userId.in.includes(m.userId) : true) &&
        (where.isActive === undefined || m.isActive === where.isActive),
    ),
  );
  const prisma = {
    communityJoinRequest: {
      findMany: jest.fn<any>(async ({ where, take }: any) => {
        const found = requests
          .filter((r) => matches(r, where))
          .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0) || b.id.localeCompare(a.id));
        return take ? found.slice(0, take) : found;
      }),
      updateMany: jest.fn<any>(async ({ where, data }: any) => {
        const hit = requests.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    communityMember: { findMany: memberReads },
  } as any;
  return { prisma, requests, memberReads };
}

const acceptance = (n: number, overrides: Partial<Request> = {}): Request => {
  const decidedAt = new Date(NOW.getTime() - ORPHAN_ACCEPTANCE_GRACE_MS - n * 60_000);
  return {
    id: hex(0x1000 + n),
    userId: hex(0x2000 + n),
    status: 'accepted',
    createdAt: new Date(decidedAt.getTime() - 3_600_000),
    decidedAt,
    decidedBy: ADMIN,
    ...overrides,
  };
};

describe('reopenOrphanedAcceptances — une acceptation scellée n\'est plus relue (#20003)', () => {
  it('une acceptation légitime (personne entrée) se scelle à sa première relecture, puis n\'est plus relue', async () => {
    const legit = acceptance(1);
    const { prisma, requests, memberReads } = makeStore({
      requests: [legit],
      members: [{ userId: legit.userId, isActive: true, leftAt: null }],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(requests[0].entryVerifiedAt).toEqual(NOW);
    expect(requests[0].status).toBe('accepted');

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: LATER });
    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: LATER });

    expect(memberReads).toHaveBeenCalledTimes(1);
  });

  it('une entrée puis un départ APRÈS la décision scelle aussi : la demande ne se rouvrira jamais', async () => {
    const legit = acceptance(1);
    const { prisma, requests } = makeStore({
      requests: [legit],
      members: [{ userId: legit.userId, isActive: false, leftAt: new Date(legit.decidedAt!.getTime() + 60_000) }],
    });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    expect(requests[0]).toMatchObject({ status: 'accepted', entryVerifiedAt: NOW });
  });

  it('une acceptation qu\'une demande plus récente a remplacée se scelle', async () => {
    const old = acceptance(1);
    const { prisma, requests } = makeStore({
      requests: [
        old,
        { ...acceptance(2), id: hex(0x3000), userId: old.userId, status: 'rejected', createdAt: new Date(old.decidedAt!.getTime() + 60_000) },
      ],
      members: [],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(requests[0]).toMatchObject({ status: 'accepted', entryVerifiedAt: NOW });
  });

  it('une orpheline (personne n\'est entré) n\'est PAS scellée : elle se rouvre', async () => {
    const orphan = acceptance(1);
    const { prisma, requests } = makeStore({ requests: [orphan], members: [] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(1);
    expect(requests[0].status).toBe('pending');
    expect(requests[0].entryVerifiedAt ?? null).toBeNull();
  });

  it('une décision encore dans le délai de grâce n\'est ni relue ni scellée', async () => {
    const fresh = acceptance(0, { decidedAt: new Date(NOW.getTime() - 60_000) });
    const { prisma, requests, memberReads } = makeStore({
      requests: [fresh],
      members: [{ userId: fresh.userId, isActive: true, leftAt: null }],
    });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    expect(memberReads).not.toHaveBeenCalled();
    expect(requests[0].entryVerifiedAt).toBeUndefined();
  });

  it('une ligne d\'avant ce lot (champ ABSENT) et une ligne au champ NUL sont toutes deux relues', async () => {
    const absent = acceptance(1);
    const explicitNull = acceptance(2, { entryVerifiedAt: null });
    const { prisma, requests } = makeStore({ requests: [absent, explicitNull], members: [] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(2);
    expect(requests.map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  it('TOUTES les orphelines sont atteignables, même derrière plus de 50 acceptations légitimes plus récentes', async () => {
    const legit = Array.from({ length: 60 }, (_, i) => acceptance(i + 1));
    const orphans = Array.from({ length: 5 }, (_, i) => acceptance(100 + i));
    const { prisma, requests } = makeStore({
      requests: [...legit, ...orphans],
      members: legit.map((r) => ({ userId: r.userId, isActive: true, leftAt: null })),
    });

    const opened = [];
    for (let i = 0; i < 3; i += 1) opened.push(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW }));

    expect(opened.reduce((a, b) => a + b, 0)).toBe(5);
    expect(requests.filter((r) => r.status === 'pending').map((r) => r.id).sort()).toEqual(orphans.map((r) => r.id).sort());
    expect(requests.filter((r) => r.status === 'accepted').every((r) => r.entryVerifiedAt instanceof Date)).toBe(true);
  });

  it('le scellement ne touche que des acceptations encore acceptées et non scellées', async () => {
    const legit = acceptance(1);
    const { prisma } = makeStore({ requests: [legit], members: [{ userId: legit.userId, isActive: true, leftAt: null }] });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    const seal = prisma.communityJoinRequest.updateMany.mock.calls.map((c: any) => c[0]).find((a: any) => a.data.entryVerifiedAt);
    expect(seal.where).toMatchObject({ id: { in: [legit.id] }, communityId: COMM, status: 'accepted' });
    expect(seal.data).toEqual({ entryVerifiedAt: NOW });
  });
});

describe('closePendingJoinRequests — une demande close par une autre porte est scellée (#20003)', () => {
  it('la clôture écrit l\'entrée vérifiée en même temps que la décision', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });

    await closePendingJoinRequests({ communityJoinRequest: { updateMany } } as any, {
      communityId: COMM, userIds: [hex(0x2001)], decidedBy: ADMIN, now: NOW,
    });

    expect(updateMany.mock.calls[0][0].data).toEqual({ status: 'accepted', decidedAt: NOW, decidedBy: ADMIN, entryVerifiedAt: NOW });
  });
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  admitCommunityMember.mockReset();
});

describe('POST /communities/:id/join-requests/:requestId/accept scelle l\'acceptation suivie de l\'entrée (#20003)', () => {
  const REQUEST = hex(0x5555);
  const ARRIVANT = hex(0x4444);

  function makeRoutePrisma() {
    return {
      community: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
          members: [{ userId: ADMIN, role: 'admin' }],
        }),
      },
      communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
      communityJoinRequest: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: REQUEST, userId: ARRIVANT, via: 'self', country: null,
          user: { id: ARRIVANT, isActive: true, deletedAt: null },
        }),
        findMany: jest.fn<any>().mockResolvedValue([]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
      userRelation: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    } as any;
  }

  async function build(prisma: any) {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async (req: any) => {
      req.authContext = {
        isAuthenticated: true, userId: ADMIN, hasFullAccess: true,
        registeredUser: { id: ADMIN, username: 'a', displayName: 'A', role: 'USER' },
      };
    });
    app.decorate('prisma', prisma);
    await registerEntryRoutes(app, { engagement: { recordActivity: jest.fn() } } as any);
    await app.ready();
    apps.push(app);
    return app;
  }

  const seals = (prisma: any) =>
    prisma.communityJoinRequest.updateMany.mock.calls.map((c: any) => c[0]).filter((a: any) => a.data.entryVerifiedAt instanceof Date);

  it('l\'entrée écrite : l\'acceptation est scellée, et seulement elle', async () => {
    admitCommunityMember.mockResolvedValue({ member: { id: hex(0x6666), userId: ARRIVANT, communityId: COMM, role: 'member' } });
    const prisma = makeRoutePrisma();
    const app = await build(prisma);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

    expect(res.statusCode).toBe(200);
    expect(seals(prisma)).toEqual([
      { where: { id: REQUEST, communityId: COMM, status: 'accepted' }, data: { entryVerifiedAt: expect.any(Date) } },
    ]);
  });

  it('l\'entrée n\'a pas eu lieu : rien n\'est scellé (la demande se rouvre)', async () => {
    admitCommunityMember.mockRejectedValue(new Error('write failed'));
    const prisma = makeRoutePrisma();
    const app = await build(prisma);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

    expect(res.statusCode).toBe(500);
    expect(seals(prisma)).toEqual([]);
  });

  it('le scellement qui lève ne défait pas une entrée réussie', async () => {
    admitCommunityMember.mockResolvedValue({ member: { id: hex(0x6666), userId: ARRIVANT, communityId: COMM, role: 'member' } });
    const prisma = makeRoutePrisma();
    prisma.communityJoinRequest.updateMany.mockImplementation(async ({ data }: any) => {
      if (data.entryVerifiedAt) throw new Error('seal failed');
      return { count: 1 };
    });
    const app = await build(prisma);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

    expect(res.statusCode).toBe(200);
  });
});
