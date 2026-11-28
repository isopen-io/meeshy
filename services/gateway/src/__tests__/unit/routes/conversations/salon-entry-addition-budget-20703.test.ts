/**
 * #20703 — entrer UNE personne à la fois dans un salon d'une communauté PRIVÉE
 * la fait entrer dans la communauté, sans son accord : c'est un ajout au sens
 * de #19812, et il paie donc le même budget que `POST /communities/:id/invite`,
 * la création d'un salon (#20464), son rattachement et la bascule en privée
 * (#20694). Jusqu'ici, `POST /conversations/:id/participants` et
 * `POST /conversations/:id/invite` ne débitaient rien : un administrateur de la
 * communauté y faisait entrer cent personnes par heure, une requête à la fois.
 *
 * Témoins, sur les deux portes : au-delà du plafond horaire de l'acteur, 429
 * nommé sans écrire ni la ligne du salon ni celle de la communauté ; le seau de
 * la cible ; une tentative vers un compte non ajoutable se paie ; un membre
 * déjà actif de la communauté, une communauté publique et un refus
 * d'autorisation ne débitent rien ; le lot rend un verdict `throttled` par
 * personne refusée, sans emporter les autres.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../../socketio/emitConversationMemberCount', () => ({ emitConversationMemberCountEvent: jest.fn<any>() }));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false })),
  }),
}));
jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({ recordEvent: jest.fn<any>().mockResolvedValue(undefined) })),
}));

import Fastify from 'fastify';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import * as rateLimiter from '../../../../utils/rate-limiter';
import { COMMUNITY_ADDITION_BUDGET, COMMUNITY_ADDITION_BUDGET_CODE } from '../../../../utils/community-addition-budget';

const CONV_ID = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd7994390c0';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const personne = (n: number) => idOf('a1', n);
const acteur = (n: number) => idOf('b2', n);

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };
type Monde = { lignes: Ligne[]; readonly isPrivate: boolean; readonly morts: Set<string>; readonly inconnus: Set<string>; readonly rows: any[] };

const membre = (userId: string, role = 'member'): Ligne => ({ userId, role, isActive: true });

function prismaDouble(monde: Monde) {
  const utilisateur = (id: string) => ({ id, username: `u${id.slice(-4)}`, displayName: `U${id.slice(-4)}`, firstName: null, lastName: null, avatar: null, systemLanguage: 'fr', deactivatedAt: null });
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.id !== COMMUNITY) return null;
        const where = args.select.members.where;
        return {
          createdBy: CREATEUR,
          isPrivate: monde.isPrivate,
          isActive: true,
          members: monde.lignes.filter((l) => l.userId === where.userId && l.isActive === where.isActive),
        };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => monde.lignes
        .filter((l) => args.where.userId.in.includes(l.userId))
        .map((l) => ({ id: `cm-${l.userId}`, ...l }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    conversation: {
      findUnique: jest.fn<any>(async () => ({
        id: CONV_ID, title: 'Salon', type: 'group', isActive: true, closedAt: null, communityId: COMMUNITY,
        participants: monde.rows.filter((r) => r.isActive).map((r) => ({ ...r, user: { id: r.userId, username: 'x', role: 'USER' } })),
      })),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    participant: {
      findFirst: jest.fn<any>(async (a: any) => monde.rows.find((r) => r.userId === a?.where?.userId && (a?.where?.isActive === undefined || r.isActive === a.where.isActive)) ?? null),
      findMany: jest.fn<any>(async (a: any) => monde.rows.filter((r) => typeof a?.where?.userId !== 'string' || r.userId === a.where.userId)),
      create: jest.fn<any>(async (a: any) => ({ id: `p-${a.data.userId}`, isActive: true, ...a.data, user: utilisateur(a.data.userId) })),
      update: jest.fn<any>(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    user: {
      findMany: jest.fn<any>(async (a: any) => (a?.where?.id?.in ?? []).filter((id: string) => !monde.morts.has(id)).map((id: string) => ({ id }))),
      findFirst: jest.fn<any>(async (a: any) => (a?.where?.OR || monde.inconnus.has(a.where.id) ? null : utilisateur(a.where.id))),
      findUnique: jest.fn<any>(async (a: any) => (monde.inconnus.has(a.where.id) ? null : utilisateur(a.where.id))),
    },
    message: { create: jest.fn<any>(async (a: any) => ({ id: 'sys-1', createdAt: new Date(), ...a.data })) },
  };
}

function monde(options: { readonly isPrivate?: boolean; readonly lignes?: readonly Ligne[]; readonly morts?: readonly string[]; readonly inconnus?: readonly string[] } = {}): Monde {
  return { lignes: [...(options.lignes ?? [])], isPrivate: options.isPrivate ?? true, morts: new Set(options.morts ?? []), inconnus: new Set(options.inconnus ?? []), rows: [] };
}

function seatActors(m: Monde, actors: readonly string[]) {
  m.rows.push(...actors.map((userId) => ({ id: `p-${userId}`, conversationId: CONV_ID, userId, role: 'admin', isActive: true, bannedAt: null, type: 'user', displayName: 'Demo' })));
}

type Porte = {
  readonly prisma: ReturnType<typeof prismaDouble>;
  ajouter(actorId: string, body: { userId?: string; userIds?: string[] }): Promise<{ status: number; body: any; headers: Record<string, unknown> }>;
  close(): Promise<void>;
};

async function porteParticipants(m: Monde): Promise<Porte> {
  const prisma = prismaDouble(m);
  const chainable: any = { emit: jest.fn<any>() };
  chainable.to = jest.fn<any>(() => chainable);
  const app = Fastify({ logger: false });
  (app as any).prisma = prisma;
  (app as any).notificationService = {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
  };
  (app as any).socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({
      getIO: jest.fn<any>().mockReturnValue(chainable),
      joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    }),
  };
  const requiredAuth = async (req: any) => {
    const userId = req.headers['x-actor'];
    req.authContext = { type: 'user', userId, isAuthenticated: true, registeredUser: { id: userId, role: 'USER' } };
  };
  registerParticipantWriteRoutes(app as any, prisma as never, requiredAuth, { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never);
  await app.ready();
  return {
    prisma,
    async ajouter(actorId, body) {
      const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: body, headers: { 'x-actor': actorId } });
      return { status: res.statusCode, body: res.json(), headers: res.headers };
    },
    close: () => app.close(),
  };
}

async function porteInvitation(m: Monde): Promise<Porte> {
  const prisma = prismaDouble(m);
  let handler: any;
  const fastify = {
    server: {},
    prisma,
    notificationService: {
      createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    },
    socketIOHandler: { getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined), broadcastMessage: jest.fn<any>().mockResolvedValue(undefined) }) },
    get: jest.fn<any>(),
    patch: jest.fn<any>(),
    post: jest.fn<any>((path: string, _o: unknown, h: any) => { if (path.includes('invite')) handler = h; }),
  };
  registerSharingRoutes(fastify as never, prisma as never, { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never);
  return {
    prisma,
    async ajouter(actorId, body) {
      const state: { status: number; body: any; headers: Record<string, unknown> } = { status: 200, body: undefined, headers: {} };
      const reply: any = {};
      reply.status = jest.fn<any>((s: number) => { state.status = s; return reply; });
      reply.code = jest.fn<any>((s: number) => { state.status = s; return reply; });
      reply.header = jest.fn<any>((k: string, v: string) => { state.headers[k.toLowerCase()] = v; return reply; });
      reply.send = jest.fn<any>((b: any) => { state.body = b; return reply; });
      await handler(
        { params: { id: CONV_ID }, body, authContext: { type: 'user', userId: actorId, isAuthenticated: true, registeredUser: { id: actorId, role: 'USER' } } },
        reply,
      );
      return state;
    },
    close: async () => undefined,
  };
}

const PORTES = [
  ['POST /conversations/:id/participants', porteParticipants],
  ['POST /conversations/:id/invite', porteInvitation],
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe.each(PORTES)('#20703 — %s dans un salon d’une communauté privée', (_nom, ouvrir) => {
  it('fait entrer jusqu’au plafond horaire de l’acteur, puis refuse en 429 nommé sans rien écrire', async () => {
    const moi = acteur(1);
    const m = monde({ lignes: [membre(moi, 'admin')] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        const ok = await porte.ajouter(moi, { userId: personne(i) });
        expect(ok.status).toBe(200);
      }
      porte.prisma.participant.create.mockClear();
      porte.prisma.communityMember.createMany.mockClear();
      const refus = await porte.ajouter(moi, { userId: personne(900) });
      expect(refus.status).toBe(429);
      expect(refus.body.code).toBe(COMMUNITY_ADDITION_BUDGET_CODE);
      expect(Number(refus.headers['retry-after'])).toBeGreaterThan(0);
      expect(porte.prisma.participant.create).not.toHaveBeenCalled();
      expect(porte.prisma.communityMember.createMany).not.toHaveBeenCalled();
      expect(porte.prisma.communityMember.updateMany).not.toHaveBeenCalled();
    } finally {
      await porte.close();
    }
  });

  it('borne la cible : au-delà de dix entrées par jour, tous acteurs confondus, 429', async () => {
    const acteurs = Array.from({ length: COMMUNITY_ADDITION_BUDGET.targetPerDay + 1 }, (_, i) => acteur(100 + i));
    const m = monde({ lignes: acteurs.map((a) => membre(a, 'admin')) });
    seatActors(m, acteurs);
    const porte = await ouvrir(m);
    const cible = personne(1);
    try {
      for (const a of acteurs.slice(0, -1)) {
        expect((await porte.ajouter(a, { userId: cible })).status).toBe(200);
        m.rows.splice(0, m.rows.length, ...m.rows.filter((r) => r.userId !== cible));
      }
      const refus = await porte.ajouter(acteurs[acteurs.length - 1], { userId: cible });
      expect(refus.status).toBe(429);
      expect(refus.body.code).toBe(COMMUNITY_ADDITION_BUDGET_CODE);
    } finally {
      await porte.close();
    }
  });

  it('une tentative vers un compte non ajoutable se paie', async () => {
    const moi = acteur(2);
    const mort = personne(77);
    const m = monde({ lignes: [membre(moi, 'admin')], morts: [mort] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: mort })).status).toBe(404);
      }
      expect((await porte.ajouter(moi, { userId: personne(1) })).status).toBe(429);
    } finally {
      await porte.close();
    }
  });

  it('un identifiant sans compte se paie aussi : le débit ne dit pas si le compte existe', async () => {
    const moi = acteur(8);
    const inconnu = personne(78);
    const m = monde({ lignes: [membre(moi, 'admin')], inconnus: [inconnu] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: inconnu })).status).toBe(404);
      }
      expect((await porte.ajouter(moi, { userId: personne(1) })).status).toBe(429);
    } finally {
      await porte.close();
    }
  });

  it('un membre déjà actif de la communauté n’entre pas dans la communauté : rien n’est débité', async () => {
    const moi = acteur(3);
    const deja = Array.from({ length: COMMUNITY_ADDITION_BUDGET.actorPerHour + 5 }, (_, i) => personne(i));
    const m = monde({ lignes: [membre(moi, 'admin'), ...deja.map((p) => membre(p))] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (const p of deja) expect((await porte.ajouter(moi, { userId: p })).status).toBe(200);
      expect((await porte.ajouter(moi, { userId: personne(900) })).status).toBe(200);
    } finally {
      await porte.close();
    }
  });

  it('une communauté publique ne fait entrer personne dans la communauté : rien n’est débité', async () => {
    const moi = acteur(4);
    const m = monde({ isPrivate: false, lignes: [membre(moi)] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour + 5; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(i) })).status).toBe(200);
      }
    } finally {
      await porte.close();
    }
  });

  it('un refus d’autorisation (403) ne débite rien : promu, l’acteur a son plafond entier', async () => {
    const moi = acteur(5);
    const m = monde({ lignes: [membre(moi)] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(i) })).status).toBe(403);
      }
      m.lignes = m.lignes.map((l) => (l.userId === moi ? { ...l, role: 'admin' } : l));
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(500 + i) })).status).toBe(200);
      }
      expect((await porte.ajouter(moi, { userId: personne(999) })).status).toBe(429);
    } finally {
      await porte.close();
    }
  });

  it('Redis en panne (consume → null) laisse passer : fail-open écrit', async () => {
    jest.spyOn(rateLimiter, 'createCustomRateLimiter').mockReturnValue({
      consume: jest.fn<any>().mockResolvedValue(null),
      release: jest.fn<any>().mockResolvedValue(undefined),
    } as never);
    const moi = acteur(6);
    const m = monde({ lignes: [membre(moi, 'admin')] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour + 5; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(i) })).status).toBe(200);
      }
    } finally {
      await porte.close();
    }
  });
});

describe('#20703 — le lot de POST /conversations/:id/participants', () => {
  it('rend `throttled` pour chaque personne refusée par le budget, sans rien écrire pour elle ni emporter le lot', async () => {
    const moi = acteur(7);
    const m = monde({ lignes: [membre(moi, 'admin')] });
    seatActors(m, [moi]);
    const porte = await ouvrir();
    async function ouvrir() { return porteParticipants(m); }
    try {
      const premiers = Array.from({ length: COMMUNITY_ADDITION_BUDGET.actorPerHour - 1 }, (_, i) => personne(i));
      expect((await porte.ajouter(moi, { userIds: premiers })).status).toBe(200);
      porte.prisma.participant.create.mockClear();
      const lot = await porte.ajouter(moi, { userIds: [personne(800), personne(801)] });
      expect(lot.status).toBe(200);
      expect(lot.body.data.results).toEqual([
        expect.objectContaining({ userId: personne(800), outcome: 'new' }),
        { userId: personne(801), outcome: 'throttled' },
      ]);
      expect(Number(lot.headers['retry-after'])).toBeGreaterThan(0);
      expect(porte.prisma.participant.create).toHaveBeenCalledTimes(1);
      expect(porte.prisma.participant.create.mock.calls[0][0].data.userId).toBe(personne(800));
    } finally {
      await porte.close();
    }
  });
});

/**
 * #20740 — un débit accepté pour une écriture qui n'a PAS lieu se rend. Sans
 * quoi un bannissement commis entre la décision et l'écriture (ou une écriture
 * qui lève) entamait les seaux de l'acteur et de la cible pour un ajout qui
 * n'a jamais eu lieu : après trois courses, la paire était fermée pour 24 h.
 */
describe.each(PORTES)('#20740 — %s rend le budget quand rien n’est écrit', (_nom, ouvrir) => {
  const ligneInactive = (userId: string) => ({
    id: `p-${userId}`, conversationId: CONV_ID, userId, role: 'member', isActive: false, bannedAt: null, leftAt: new Date(0), joinedAt: new Date(0), type: 'user', displayName: 'Ancien',
  });
  const P2025 = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });

  it('une course de bannissement (rejoin refusé à l’écriture) ne coûte rien : la paire reste ouverte', async () => {
    const moi = acteur(20);
    const cible = personne(20);
    const m = monde({ lignes: [membre(moi, 'admin')] });
    seatActors(m, [moi]);
    m.rows.push(ligneInactive(cible));
    const porte = await ouvrir(m);
    porte.prisma.participant.update.mockRejectedValue(P2025);
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour + 1; i += 1) {
        expect((await porte.ajouter(moi, { userId: cible })).status).not.toBe(429);
      }
      porte.prisma.participant.update.mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data }));
      expect((await porte.ajouter(moi, { userId: cible })).status).toBe(200);
    } finally {
      await porte.close();
    }
  });

  it('une création qui lève ne coûte rien : le plafond de l’acteur est intact ensuite', async () => {
    const moi = acteur(21);
    const m = monde({ lignes: [membre(moi, 'admin')] });
    seatActors(m, [moi]);
    const porte = await ouvrir(m);
    const create = porte.prisma.participant.create.getMockImplementation();
    porte.prisma.participant.create.mockRejectedValue(new Error('base indisponible'));
    try {
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(300 + i) }).catch(() => ({ status: 500 }))).status).not.toBe(429);
      }
      porte.prisma.participant.create.mockImplementation(create as never);
      for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
        expect((await porte.ajouter(moi, { userId: personne(400 + i) })).status).toBe(200);
      }
      expect((await porte.ajouter(moi, { userId: personne(999) })).status).toBe(429);
    } finally {
      await porte.close();
    }
  });
});
