/**
 * Les entrées d'un lien de communauté (#19429, besoin #19290) : comptes exacts
 * sur 7 et 30 jours, série quotidienne, entrées « par ce lien », pays de
 * l'arrivant, ordre récent d'abord, et les demandes en attente.
 *
 * Témoins écrits sur un MODÉRATEUR (pas seulement sur le créateur) et sur un
 * MEMBRE simple, et sur ce qui part À CÔTÉ du champ gardé : `joinCountry` et
 * `joinedVia` d'une rangée de la liste des membres.
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

const broadcasts: unknown[] = [];
jest.mock('../../../../services/community-member-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-member-broadcast') as Record<string, unknown>;
  return { ...actual, scheduleCommunityMemberBroadcastFrom: jest.fn((_f: unknown, change: unknown) => { broadcasts.push(change); }) };
});

const joinRequested: unknown[] = [];
jest.mock('../../../../services/community-join-request-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-join-request-broadcast') as Record<string, unknown>;
  return { ...actual, scheduleCommunityJoinRequestedFrom: jest.fn((_f: unknown, change: unknown) => { joinRequested.push(change); }) };
});

import { registerMembershipRoutes } from '../../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../../routes/communities/members';
import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { computeCommunityEntryStats } from '../../../../services/community-entries';
import { broadcastCommunityJoinRequested, joinRequestedAudience } from '../../../../services/community-join-request-broadcast';

const VIEWER = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ARRIVANT = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';
const ROW = '507f1f77bcf86cd799430066';

const authAs = (userId: string) => ({
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'u', displayName: 'U', role: 'USER' },
});

type Role = 'admin' | 'moderator' | 'member' | null;

const USABLE = { isActive: true, deletedAt: null, deactivatedAt: null };

function makePrisma(options: { viewerRole?: Role; requiresJoinApproval?: boolean; isPrivate?: boolean; request?: Record<string, unknown> | null; rejected?: Record<string, unknown> | null } = {}) {
  const viewerRole = options.viewerRole === undefined ? 'moderator' : options.viewerRole;
  const members = viewerRole ? [{ userId: VIEWER, role: viewerRole }] : [];
  const rows = [{
    id: ROW, communityId: COMM, userId: ARRIVANT, role: 'member', isActive: true, leftAt: null,
    joinedAt: new Date('2026-11-16T10:00:00Z'), joinedVia: 'link', joinCountry: 'SN',
    user: { id: ARRIVANT, username: 'koffi', displayName: 'Koffi', avatar: null, isOnline: false, lastActiveAt: null },
  }];
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: options.isPrivate ?? false,
        requiresJoinApproval: options.requiresJoinApproval ?? false, members,
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue(rows),
      count: jest.fn<any>().mockResolvedValue(58),
      create: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
    },
    communityJoinRequest: {
      findFirst: jest.fn<any>(async ({ where }: any) =>
        where.status === 'rejected'
          ? (options.rejected ?? null)
          : (options.request === undefined ? null : options.request)),
      findMany: jest.fn<any>(async ({ where }: any) => (where.userId ? [{ id: REQUEST }] : [{
        id: REQUEST, communityId: COMM, userId: ARRIVANT, status: 'pending', via: 'link', country: 'SN',
        createdAt: new Date('2026-11-16T09:00:00Z'),
        user: { id: ARRIVANT, username: 'nadia', displayName: 'Nadia', avatar: null, ...USABLE },
      }])),
      count: jest.fn<any>().mockResolvedValue(1),
      create: jest.fn<any>(async ({ data }: any) => ({ id: REQUEST, status: 'pending', createdAt: new Date(), ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: REQUEST, ...data })),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const apps: FastifyInstance[] = [];
const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
async function build(prisma: any, userId = VIEWER): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authAs(userId); });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app, { engagement });
  await registerMemberRoutes(app);
  await registerEntryRoutes(app, { engagement });
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  broadcasts.splice(0);
  joinRequested.splice(0);
  engagement.recordActivity.mockClear();
});

describe('computeCommunityEntryStats — la série et les fenêtres', () => {
  const now = new Date('2026-11-17T12:00:00Z');

  it('compte 7 et 30 jours calendaires UTC, aujourd\'hui compris, et rend 30 jours dans l\'ordre', () => {
    const stats = computeCommunityEntryStats({
      joinedAt: [
        new Date('2026-11-17T08:00:00Z'),
        new Date('2026-11-11T00:00:00Z'),
        new Date('2026-11-10T23:59:59Z'),
        new Date('2026-10-19T00:00:00Z'),
        new Date('2026-10-18T23:59:59Z'),
      ],
      viaLink: 58,
      now,
    });
    expect(stats.last7).toBe(2);
    expect(stats.last30).toBe(4);
    expect(stats.viaLink).toBe(58);
    expect(stats.series30).toHaveLength(30);
    expect(stats.series30[0]).toEqual({ day: '2026-10-19', count: 1 });
    expect(stats.series30[29]).toEqual({ day: '2026-11-17', count: 1 });
    expect(stats.series30.reduce((s, d) => s + d.count, 0)).toBe(4);
  });
});

describe('GET /communities/:id/entries/stats', () => {
  it('sert les comptes à un MODÉRATEUR', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator' });
    prisma.communityMember.findMany.mockResolvedValue([{ joinedAt: new Date() }]);
    prisma.communityMember.count.mockImplementation(async ({ where }: any) => {
      if (where.joinedVia === 'link') return 58;
      const days = Math.round((Date.now() - where.joinedAt.gte.getTime()) / 86_400_000);
      return days <= 7 ? 12 : 61;
    });
    const app = await build(prisma);
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/entries/stats` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.last7).toBe(12);
    expect(data.last30).toBe(61);
    expect(data.viaLink).toBe(58);
    expect(data.series30).toHaveLength(30);
    expect(data.series30[29].count).toBe(1);
    expect(prisma.communityMember.findMany.mock.calls[0][0].take).toBeGreaterThan(0);
    expect(prisma.communityMember.count).toHaveBeenCalledWith({ where: { communityId: COMM, isActive: true, joinedVia: 'link' } });
  });

  it('rend un 404 générique à un MEMBRE simple', async () => {
    const app = await build(makePrisma({ viewerRole: 'member' }));
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/entries/stats` });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain('last7');
  });

  it('rend un 404 générique à un non-membre', async () => {
    const app = await build(makePrisma({ viewerRole: null }));
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/entries/stats` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /communities/:id/members — ordre récent et champs d\'entrée', () => {
  it('?order=desc range par joinedAt décroissant ; sans paramètre, l\'ordre ancien tient', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    await app.inject({ method: 'GET', url: `/communities/${COMM}/members?order=desc` });
    expect(prisma.communityMember.findMany.mock.calls[0][0].orderBy).toEqual({ joinedAt: 'desc' });
    await app.inject({ method: 'GET', url: `/communities/${COMM}/members` });
    expect(prisma.communityMember.findMany.mock.calls[1][0].orderBy).toEqual({ joinedAt: 'asc' });
  });

  it('sert joinedVia et joinCountry à un MODÉRATEUR', async () => {
    const app = await build(makePrisma({ viewerRole: 'moderator' }));
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/members?order=desc` });
    const row = res.json().data[0];
    expect(row.joinedVia).toBe('link');
    expect(row.joinCountry).toBe('SN');
  });

  it('ne sert NI le pays NI la source à un MEMBRE simple — le champ voisin aussi', async () => {
    const app = await build(makePrisma({ viewerRole: 'member' }));
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/members` });
    expect(res.statusCode).toBe(200);
    const body = res.body;
    expect(body).not.toContain('"SN"');
    expect(body).not.toContain('"link"');
  });
});

describe('POST /communities/:id/join — la source et le pays de l\'entrée', () => {
  it('par le lien : joinedVia link et le pays du CDN, jamais la ville', async () => {
    const prisma = makePrisma({ viewerRole: null });
    const app = await build(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM}/join`,
      headers: { 'cf-ipcountry': 'sn', 'cf-ipcity': 'Dakar' }, payload: { via: 'link' },
    });
    expect(res.statusCode).toBe(200);
    const data = prisma.communityMember.create.mock.calls[0][0].data;
    expect(data.joinedVia).toBe('link');
    expect(data.joinCountry).toBe('SN');
    expect(JSON.stringify(data)).not.toContain('Dakar');
    expect(broadcasts).toEqual([expect.objectContaining({ kind: 'joined', via: 'link' })]);
  });

  it('sans corps (ancien client) : joinedVia self, comme avant', async () => {
    const prisma = makePrisma({ viewerRole: null });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create.mock.calls[0][0].data.joinedVia).toBe('self');
    expect(broadcasts).toEqual([expect.objectContaining({ via: 'self' })]);
  });

  it('une source inconnue est refusée (400), rien n\'est écrit', async () => {
    const prisma = makePrisma({ viewerRole: null });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { via: 'invited' } });
    expect(res.statusCode).toBe(400);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });

  it('« Valider chaque entrée » : une DEMANDE en attente (202), aucune adhésion, les admins prévenus', async () => {
    const prisma = makePrisma({ viewerRole: null, requiresJoinApproval: true });
    const app = await build(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM}/join`, headers: { 'cf-ipcountry': 'SN' }, payload: { via: 'link', acceptsPending: true },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toEqual(expect.objectContaining({ status: 'pending', requestId: REQUEST }));
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityJoinRequest.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ communityId: COMM, userId: VIEWER, via: 'link', country: 'SN', status: 'pending' }),
    );
    expect(joinRequested).toEqual([expect.objectContaining({ communityId: COMM, requestId: REQUEST })]);
  });

  it('une demande déjà en attente n\'en ouvre pas une seconde', async () => {
    const prisma = makePrisma({
      viewerRole: null, requiresJoinApproval: true,
      request: { id: REQUEST, communityId: COMM, userId: VIEWER, status: 'pending', createdAt: new Date() },
    });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { acceptsPending: true } });
    expect(res.statusCode).toBe(202);
    expect(prisma.communityJoinRequest.create).not.toHaveBeenCalled();
    expect(joinRequested).toEqual([]);
  });

  it('ANCIEN client (sans corps) : une erreur métier qu\'il sait afficher (409 COMMUNITY_JOIN_PENDING), jamais un 2xx de forme inconnue — la demande est bien posée', async () => {
    const prisma = makePrisma({ viewerRole: null, requiresJoinApproval: true });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join` });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('COMMUNITY_JOIN_PENDING');
    expect(body).not.toHaveProperty('data');
    expect(prisma.communityJoinRequest.create).toHaveBeenCalledTimes(1);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });

  it('une communauté PRIVÉE reste sur invitation, même si elle valide chaque entrée : 403, aucune demande, personne prévenu', async () => {
    const prisma = makePrisma({ viewerRole: null, requiresJoinApproval: true, isPrivate: true });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { acceptsPending: true } });
    expect(res.statusCode).toBe(403);
    expect(prisma.communityJoinRequest.create).not.toHaveBeenCalled();
    expect(joinRequested).toEqual([]);
  });

  it('après un refus récent, une nouvelle demande attend (403 COMMUNITY_JOIN_COOLDOWN) : les intendants ne sont pas relancés', async () => {
    const prisma = makePrisma({
      viewerRole: null, requiresJoinApproval: true,
      rejected: { id: REQUEST, decidedAt: new Date(Date.now() - 3_600_000) },
    });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { acceptsPending: true } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_JOIN_COOLDOWN');
    expect(prisma.communityJoinRequest.create).not.toHaveBeenCalled();
    expect(joinRequested).toEqual([]);
    const rejectedLookup = prisma.communityJoinRequest.findFirst.mock.calls.find((c: any) => c[0].where.status === 'rejected');
    expect(rejectedLookup[0].where.decidedAt.gte).toBeInstanceOf(Date);
  });

  it('deux demandes simultanées convergent sur UNE : la plus ancienne reste, la seconde s\'efface sans prévenir personne', async () => {
    const prisma = makePrisma({ viewerRole: null, requiresJoinApproval: true });
    const MINE = '507f1f77bcf86cd799430077';
    prisma.communityJoinRequest.create.mockResolvedValue({ id: MINE });
    prisma.communityJoinRequest.findMany.mockResolvedValue([{ id: REQUEST }, { id: MINE }]);
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { acceptsPending: true } });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.requestId).toBe(REQUEST);
    expect(prisma.communityJoinRequest.deleteMany).toHaveBeenCalledWith({ where: { id: MINE, status: 'pending' } });
    expect(joinRequested).toEqual([]);
  });
});

describe('Les demandes en attente', () => {
  const pending = { id: REQUEST, communityId: COMM, userId: ARRIVANT, status: 'pending', via: 'link', country: 'SN', user: { id: ARRIVANT, ...USABLE } };

  it('GET liste les demandes à un MODÉRATEUR, récentes d\'abord, avec le pays', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator' });
    const app = await build(prisma);
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toEqual(expect.objectContaining({ id: REQUEST, userId: ARRIVANT, country: 'SN', via: 'link' }));
    expect(prisma.communityJoinRequest.findMany.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: { communityId: COMM, status: 'pending' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('GET écarte les demandeurs bloqués avec l\'intendant et ceux dont le compte n\'est plus utilisable — sans servir l\'état du compte', async () => {
    const BLOQUE = '507f1f77bcf86cd799430088';
    const PARTI = '507f1f77bcf86cd799430099';
    const prisma = makePrisma({ viewerRole: 'moderator' });
    const row = (id: string, userId: string, state = USABLE) => ({
      id, communityId: COMM, userId, status: 'pending', via: 'self', country: 'SN', createdAt: new Date(),
      user: { id: userId, username: userId, displayName: null, avatar: null, ...state },
    });
    prisma.communityJoinRequest.findMany.mockResolvedValue([
      row(REQUEST, ARRIVANT),
      row('507f1f77bcf86cd7994300a1', BLOQUE),
      row('507f1f77bcf86cd7994300a2', PARTI, { isActive: true, deletedAt: new Date(), deactivatedAt: null } as any),
    ]);
    prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [BLOQUE] });
    const app = await build(prisma);
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((r: any) => r.userId)).toEqual([ARRIVANT]);
    expect(res.body).not.toContain('deactivatedAt');
  });

  it('GET pagine au-delà de 100 demandes : la 101e servable, la plus ancienne, est servie à la page suivante, et la liste dit qu\'il en reste', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator' });
    const BLOQUE = '507f1f77bcf86cd799430088';
    const ids = Array.from({ length: 102 }, (_, i) => `65b${String(i).padStart(21, '0')}`);
    const rows = ids.map((id, i) => ({
      id, communityId: COMM, userId: i === 50 ? BLOQUE : `66c${String(i).padStart(21, '0')}`, status: 'pending', via: 'self', country: null,
      createdAt: new Date(Date.UTC(2026, 10, 1) + i * 60_000),
      user: { id: `u${i}`, username: `u${i}`, displayName: null, avatar: null, ...USABLE },
    }));
    prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [BLOQUE] });
    prisma.communityJoinRequest.findMany.mockImplementation(async (args: any) => {
      const notIn: string[] = args.where.userId?.notIn ?? [];
      const sorted = rows
        .filter((r) => !notIn.includes(r.userId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor.id) + (args.skip ?? 0) : 0;
      return sorted.slice(start, start + args.take);
    });
    const app = await build(prisma);
    const first = (await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` })).json();
    expect(first.data).toHaveLength(100);
    expect(first.pagination).toEqual(expect.objectContaining({ limit: 100, hasMore: true, nextCursor: first.data[99].id }));
    expect(first.data.map((r: any) => r.userId)).not.toContain(BLOQUE);
    const second = (await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests?cursor=${first.pagination.nextCursor}` })).json();
    expect(second.data.map((r: any) => r.id)).toEqual([ids[0]]);
    expect(second.pagination).toEqual(expect.objectContaining({ hasMore: false, nextCursor: null }));

    const page = (cursor?: string) => app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests?limit=40${cursor ? `&cursor=${cursor}` : ''}` }).then((r) => r.json());
    const served: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 5; guard += 1) {
      const res = await page(cursor);
      served.push(...res.data.map((r: any) => r.id));
      if (!res.pagination.hasMore) break;
      cursor = res.pagination.nextCursor;
    }
    expect(served).toHaveLength(101);
    expect(new Set(served).size).toBe(101);
    expect(served).toContain(ids[0]);
    expect(served.at(-1)).toBe(ids[0]);
  });

  it('GET refuse une limite ou un curseur illisibles (400), sans rien lire', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator' });
    const app = await build(prisma);
    expect((await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests?limit=500` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests?cursor=nope` })).statusCode).toBe(400);
    expect(prisma.communityJoinRequest.findMany).not.toHaveBeenCalled();
  });

  it('GET rend un 404 générique à un MEMBRE simple', async () => {
    const prisma = makePrisma({ viewerRole: 'member' });
    const app = await build(prisma);
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityJoinRequest.findMany).not.toHaveBeenCalled();
  });

  it('accepter (MODÉRATEUR) fait entrer avec la source et le pays de la demande, et clôt la demande', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: pending });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      communityId: COMM, userId: ARRIVANT, role: 'member', joinedVia: 'link', joinCountry: 'SN',
    }));
    expect(prisma.communityJoinRequest.updateMany.mock.calls[0][0]).toEqual({
      where: { id: REQUEST, communityId: COMM, status: 'pending' },
      data: expect.objectContaining({ status: 'accepted', decidedBy: VIEWER, decidedAt: expect.any(Date) }),
    });
    expect(broadcasts).toEqual([expect.objectContaining({ kind: 'joined', userId: ARRIVANT, via: 'link' })]);
    expect(engagement.recordActivity).toHaveBeenCalledWith(ARRIVANT, 'social.community_joined', expect.objectContaining({ targetId: COMM }));
    expect(res.json().data.joinCountry).toBe('SN');
  });

  it('deux décisions concurrentes : celle qui ne bascule pas la demande (count 0) rend 404 et n\'écrit AUCUN membre', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: pending });
    prisma.communityJoinRequest.updateMany.mockResolvedValue({ count: 0 });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
    expect(broadcasts).toEqual([]);
  });

  it('un demandeur dont le compte n\'est plus utilisable ne s\'accepte pas : 404, la demande reste intacte', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: { ...pending, user: { id: ARRIVANT, isActive: false, deletedAt: null, deactivatedAt: new Date() } } });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityJoinRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });

  it('un intendant bloqué avec le demandeur (dans un sens ou l\'autre) ne tranche pas sa demande : 404', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: pending });
    prisma.user.findFirst.mockResolvedValue({ id: ARRIVANT });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityJoinRequest.updateMany).not.toHaveBeenCalled();
  });

  it('accepter réactive une ligne laissée par un départ au lieu d\'en créer une seconde', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: pending });
    prisma.communityMember.findFirst.mockResolvedValue({ id: ROW, isActive: false });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
      isActive: true, leftAt: null, role: 'member', joinedVia: 'link', joinCountry: 'SN',
    }));
  });

  it('refuser (MODÉRATEUR) clôt la demande sans faire entrer personne', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator', request: pending });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityJoinRequest.updateMany.mock.calls[0][0]).toEqual({
      where: { id: REQUEST, communityId: COMM, status: 'pending' },
      data: expect.objectContaining({ status: 'rejected', decidedBy: VIEWER }),
    });
  });

  it('un MEMBRE simple qui accepte reçoit un 404 générique, rien n\'est écrit', async () => {
    const prisma = makePrisma({ viewerRole: 'member', request: pending });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityJoinRequest.updateMany).not.toHaveBeenCalled();
  });

  it('une demande inconnue ou déjà tranchée rend 404', async () => {
    const prisma = makePrisma({ viewerRole: 'admin', request: null });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityJoinRequest.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: REQUEST, communityId: COMM, status: 'pending' }),
    );
  });
});

describe('community:join-requested — l\'audience', () => {
  it('les administrateurs, les modérateurs et le créateur, une fois chacun ; jamais un membre simple ni l\'arrivant', () => {
    const audience = joinRequestedAudience({
      createdBy: CREATOR,
      stewards: [{ userId: VIEWER, role: 'moderator' }, { userId: CREATOR, role: 'admin' }, { userId: ROW, role: 'member' }],
    });
    expect([...audience].sort()).toEqual([VIEWER, CREATOR].sort());
  });

  it('un intendant bloqué avec le demandeur (dans un sens ou l\'autre) n\'est pas prévenu ; les autres le sont', async () => {
    const MOD = '507f1f77bcf86cd7994300b1';
    const prisma = {
      community: { findFirst: jest.fn<any>().mockResolvedValue({ createdBy: CREATOR }) },
      communityMember: { findMany: jest.fn<any>().mockResolvedValue([{ userId: VIEWER, role: 'moderator' }, { userId: MOD, role: 'admin' }]) },
      communityJoinRequest: { count: jest.fn<any>().mockResolvedValue(1) },
      user: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: MOD }]),
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [CREATOR] }),
      },
    };
    const sent: string[] = [];
    await broadcastCommunityJoinRequested(
      { prisma: prisma as any, deliver: (userId) => { sent.push(userId); } },
      { communityId: COMM, requestId: REQUEST, userId: ARRIVANT },
    );
    expect(sent).toEqual([VIEWER]);
  });
});
