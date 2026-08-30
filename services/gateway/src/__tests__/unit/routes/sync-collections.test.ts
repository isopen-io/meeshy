/**
 * Tests — issue #4171, critères 1 et 5(a).
 *
 * `GET /sync` ne connaissait que `messages` (A3.1). Ce lot élargit
 * `SUPPORTED_COLLECTIONS` à `conversations`, `reactions` et `participants` —
 * chacune sous les MÊMES gardes RLS et le MÊME budget que `messages`
 * (`routes/sync/{conversations,reactions,participants}.ts`).
 *
 * Fichier SÉPARÉ de `sync.test.ts` (déjà à 1608 lignes) plutôt qu'un ajout —
 * la découpe par responsabilité de la règle 7 du dépôt (budget de taille)
 * s'applique aussi aux suites.
 *
 * ## La subtilité de placement du critère 5
 *
 * « Un témoin de RLS écrit sur un compte qui participe à TOUT ne peut pas
 * tomber. » Chaque fixture RLS ci-dessous porte donc DEUX conversations —
 * `CONV_MINE` (le lecteur y participe) et `CONV_OTHER` (il n'y participe PAS)
 * — et le double Prisma des tables interrogées (`conversation`, `reaction`)
 * FILTRE réellement sur le `where` reçu plutôt que de rendre un jeu de
 * données déjà expurgé : un défaut qui oublierait `conversationId: { in }`
 * ferait fuir `CONV_OTHER` à travers CE double, là où un double statique ne
 * l'aurait jamais pu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_MINE = '507f1f77bcf86cd799439a01';
const CONV_OTHER = '507f1f77bcf86cd799439b02'; // le lecteur n'y participe PAS

type TestAuthContext = {
  userId?: string;
  type?: 'user' | 'anonymous';
  participantId?: string;
  registeredUser?: { role?: string } | null;
};

let mockAuthContext: TestAuthContext = { userId: USER_ID, type: 'user' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as unknown as { authContext: TestAuthContext }).authContext = mockAuthContext;
    },
}));

// Le rate-limiter réel n'a pas sa place ici — chaque `describe` fait plusieurs
// requêtes et ce fichier ne prouve pas le débit (`sync-rate-limit.test.ts` s'en
// charge). Sans ce mock, les 60/min réels restent largement sous ce que ce
// fichier appelle — mais le geste documente l'intention et isole les deux
// préoccupations, comme `directory/presence.test.ts` le fait déjà.
jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

type Row = Record<string, unknown>;

/** Un magasin qui HONORE `where.id.in` (ou `where.conversationId.in`) — la
 *  seule façon qu'un test de RLS ait une chance de faire fuir `CONV_OTHER`
 *  s'il y a un défaut, plutôt que de rendre un jeu déjà correct. */
function scopedStore(rows: Row[], idKey: 'id' | 'conversationId') {
  return jest.fn<any>(async (args: any) => {
    const inSet: string[] | undefined = args?.where?.[idKey]?.in;
    const floor: Date | undefined = args?.where?.updatedAt?.gt ?? args?.where?.createdAt?.gt;
    return rows.filter((r) => {
      if (inSet && !inSet.includes(r[idKey] as string)) return false;
      if (floor && !(r.updatedAt as Date > floor)) return false;
      return true;
    });
  });
}

/**
 * `participant.findMany` sert TROIS requêtes distinctes selon la collection
 * (appartenance RLS, départs de `conversations`, roster + départs de
 * `participants`) — un double NAÏF qui rend toujours la même ligne fait fuiter
 * un `leftAt: undefined` (jamais produit par Prisma, qui rend `null`) dans une
 * requête censée porter un `where.OR` sur les trois colonnes de départ. Le
 * discriminant est la FORME du `where`, comme `directory/presence.test.ts` le
 * fait déjà pour un autre couple de requêtes sur la même table.
 */
function defaultParticipantFindMany() {
  return jest.fn<any>().mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve([]); // aucun départ par défaut
    return Promise.resolve([{ id: 'p-mine', conversationId: CONV_MINE }]);
  });
}

function makePrisma(over: Partial<Record<string, unknown>> = {}) {
  return {
    participant: { findMany: defaultParticipantFindMany() },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as any;
}

async function buildApp(prisma: any, authContext: TestAuthContext = { userId: USER_ID, type: 'user' }): Promise<FastifyInstance> {
  mockAuthContext = authContext;
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

// ─── conversations ──────────────────────────────────────────────────────────

describe('GET /sync — collection conversations', () => {
  const conv = (id: string, created: string, updated: string) => ({
    id, identifier: `id-${id}`, type: 'group', title: 'T', description: null,
    avatar: null, banner: null, communityId: null, isActive: true, closedAt: null,
    memberCount: 3, lastMessageAt: new Date(updated), defaultWriteRole: 'everyone',
    isAnnouncementChannel: false, slowModeSeconds: 0, encryptionMode: null,
    encryptionProtocol: null, autoTranslateEnabled: true,
    createdAt: new Date(created), updatedAt: new Date(updated),
  });

  it('rend added/modified/deleted/truncated/nextCursor', async () => {
    const prisma = makePrisma({
      conversation: { findMany: scopedStore(
        [conv(CONV_MINE, '2026-07-02T00:00:00Z', '2026-07-02T10:00:00Z')], 'id',
      ) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    expect(res.statusCode).toBe(200);
    const c = res.json().data.collections.conversations;
    expect(Object.keys(c).sort()).toEqual(['added', 'deleted', 'modified', 'nextCursor', 'truncated']);
    expect(c.added.map((x: any) => x.id)).toEqual([CONV_MINE]);
    expect(c.modified).toEqual([]);
    await app.close();
  });

  it('sépare added (créée après since) et modified (créée avant, modifiée après)', async () => {
    const prisma = makePrisma({
      conversation: { findMany: scopedStore(
        [
          conv(CONV_MINE, '2026-06-01T00:00:00Z', '2026-07-02T10:00:00Z'), // modified
        ], 'id',
      ) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    const c = res.json().data.collections.conversations;
    expect(c.added).toEqual([]);
    expect(c.modified.map((x: any) => x.id)).toEqual([CONV_MINE]);
    await app.close();
  });

  /**
   * CRITÈRE 5(a) — le témoin explicitement nommé par l'issue. Le lecteur
   * participe à `CONV_MINE`, PAS à `CONV_OTHER`, et le double `conversation`
   * porte les DEUX : seul un `where.id.in` correct empêche `CONV_OTHER` de
   * sortir.
   */
  it('RLS fail-closed : un compte participant de A et non de B ne voit rien de B', async () => {
    const prisma = makePrisma({
      conversation: { findMany: scopedStore(
        [
          conv(CONV_MINE, '2026-07-02T00:00:00Z', '2026-07-02T10:00:00Z'),
          conv(CONV_OTHER, '2026-07-02T00:00:00Z', '2026-07-02T10:00:00Z'),
        ], 'id',
      ) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    const c = res.json().data.collections.conversations;
    const ids = [...c.added, ...c.modified].map((x: any) => x.id);
    expect(ids).toEqual([CONV_MINE]);
    expect(ids).not.toContain(CONV_OTHER);

    // Et la requête elle-même ne demande QUE la conversation autorisée — la
    // RLS se lit dans le `where`, pas seulement dans ce que le double a bien
    // voulu filtrer.
    const call = prisma.conversation.findMany.mock.calls[0]![0] as any;
    expect(call.where.id.in).toEqual([CONV_MINE]);
    await app.close();
  });

  it('un compte SANS conversation ne lit jamais `conversation.findMany`', async () => {
    const prisma = makePrisma({ participant: { findMany: jest.fn<any>().mockResolvedValue([]) } });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    expect(res.json().data.collections.conversations.added).toEqual([]);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('partage le MÊME budget de poids que messages — une ligne surdimensionnée tronque', async () => {
    const { SYNC_MAX_PAGE_BYTES } = await import('../../../routes/sync');
    // Quatre conversations dont le lecteur est RÉELLEMENT membre (une ligne
    // `Participant` par id) : le budget doit pouvoir mordre sans qu'un défaut
    // de RLS soit ce qui explique la troncature.
    const ids = ['507f1f77bcf86cd799439c01', '507f1f77bcf86cd799439c02', '507f1f77bcf86cd799439c03', '507f1f77bcf86cd799439c04'];
    const heavy = (id: string, seconds: number) => ({
      ...conv(id, '2026-06-01T00:00:00Z', `2026-07-02T00:00:${String(seconds).padStart(2, '0')}.000Z`),
      description: 'x'.repeat(Math.floor(SYNC_MAX_PAGE_BYTES / 2)),
    });
    const prisma = makePrisma({
      conversation: { findMany: scopedStore(ids.map((id, k) => heavy(id, k)), 'id') },
      participant: { findMany: jest.fn<any>().mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve([]); // aucun départ dans ce test
        return Promise.resolve(ids.map((id) => ({ id: `p-${id}`, conversationId: id })));
      }) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    const c = res.json().data.collections.conversations;

    // Chaque ligne pèse la moitié du budget : la 3e franchit la borne et est
    // EXCLUE (`trimToByteBudget`, `routes/sync/budget.ts`) — même mécanique
    // que `messages`, prouvée ici pour `conversations`.
    expect(c.added.length + c.modified.length).toBeLessThan(ids.length);
    expect(c.truncated).toBe(true);
    expect(typeof c.nextCursor).toBe('string');
    await app.close();
  });
});

// ─── reactions ──────────────────────────────────────────────────────────────

describe('GET /sync — collection reactions', () => {
  const reaction = (id: string, conversationId: string, created: string, updated = created) => ({
    id, messageId: `m-${id}`, participantId: 'p-x', emoji: '👍',
    createdAt: new Date(created), updatedAt: new Date(updated),
    message: { conversationId },
  });

  /** `reaction.findMany` filtre sur la relation `message.conversationId.in`,
   *  jamais sur un `conversationId` de premier niveau. */
  function reactionStore(rows: ReturnType<typeof reaction>[]) {
    return jest.fn<any>(async (args: any) => {
      const inSet: string[] | undefined = args?.where?.message?.conversationId?.in;
      const floor: Date | undefined = args?.where?.updatedAt?.gt;
      return rows.filter((r) => {
        if (inSet && !inSet.includes(r.message.conversationId)) return false;
        if (floor && !(r.updatedAt > floor)) return false;
        return true;
      });
    });
  }

  it('rend added/modified, et `deleted` TOUJOURS vide — Reaction est hard-deleted', async () => {
    const prisma = makePrisma({
      reaction: { findMany: reactionStore([reaction('r1', CONV_MINE, '2026-07-02T10:00:00Z')]) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=reactions` });
    const r = res.json().data.collections.reactions;
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ id: 'r1', messageId: 'm-r1', conversationId: CONV_MINE, emoji: '👍' });
    expect(r.deleted).toEqual([]);
    await app.close();
  });

  it('RLS fail-closed : une réaction sur un message de B ne sort jamais pour un participant de A', async () => {
    const prisma = makePrisma({
      reaction: { findMany: reactionStore([
        reaction('r-mine', CONV_MINE, '2026-07-02T10:00:00Z'),
        reaction('r-other', CONV_OTHER, '2026-07-02T10:00:00Z'),
      ]) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=reactions` });
    const ids = res.json().data.collections.reactions.added.map((x: any) => x.id);
    expect(ids).toEqual(['r-mine']);
    expect(ids).not.toContain('r-other');

    const call = prisma.reaction.findMany.mock.calls[0]![0] as any;
    expect(call.where.message.conversationId.in).toEqual([CONV_MINE]);
    await app.close();
  });

  it('sans conversation, ne lit jamais `reaction.findMany`', async () => {
    const prisma = makePrisma({ participant: { findMany: jest.fn<any>().mockResolvedValue([]) } });
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=reactions` });
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── participants ───────────────────────────────────────────────────────────

describe('GET /sync — collection participants', () => {
  const participant = (id: string, conversationId: string, joined: string, opts: Partial<Row> = {}) => ({
    id, conversationId, userId: `u-${id}`, type: 'user', displayName: `P ${id}`,
    avatar: null, role: 'member', language: 'fr', isActive: true,
    isOnline: true, lastActiveAt: new Date('2026-07-02T09:00:00Z'),
    joinedAt: new Date(joined), leftAt: null, bannedAt: null,
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true },
    user: {
      id: `u-${id}`, username: `p${id}`, firstName: null, lastName: null, displayName: `P ${id}`,
      avatar: null, role: 'USER', systemLanguage: 'fr', regionalLanguage: null,
      customDestinationLanguage: null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    ...opts,
  });

  /**
   * `participant.findMany` sert TROIS formes de requête pour cette collection
   * seule : appartenance RLS (`where.userId`/`where.id`), roster
   * (`where.conversationId.in` + `where.isActive`/`where.joinedAt`) et départs
   * (`where.OR` sur `leftAt`/`bannedAt`). Un double qui ne discrimine QUE les
   * deux premières laisse la troisième tomber sur le double du roster, qui lui
   * sert des lignes `leftAt: null` — `syncParticipantDepartures` n'a alors
   * plus aucune date à choisir et plante sur `.toISOString()`. La forme du
   * `where` est le SEUL discriminant fiable, comme `directory/presence.test.ts`
   * le pratique déjà sur `prisma.user`.
   */
  function participantFindManyByShape(opts: {
    membership?: Array<{ id: string; conversationId: string }>;
    roster?: ReturnType<typeof participant>[];
    departures?: Array<{ id: string; conversationId: string; leftAt: Date | null; bannedAt: Date | null }>;
  }) {
    const membership = opts.membership ?? [{ id: 'p-mine', conversationId: CONV_MINE }];
    const departures = opts.departures ?? [];
    return jest.fn<any>((args: any) => {
      if (args?.where?.userId || args?.where?.id) return Promise.resolve(membership);
      if (args?.where?.OR) return Promise.resolve(departures);
      const inSet: string[] | undefined = args?.where?.conversationId?.in;
      const floor: Date | undefined = args?.where?.joinedAt?.gt;
      const wantsActive = args?.where?.isActive === true;
      return Promise.resolve((opts.roster ?? []).filter((r) => {
        if (inSet && !inSet.includes(r.conversationId)) return false;
        if (wantsActive && !r.isActive) return false;
        if (floor && !(r.joinedAt > floor)) return false;
        return true;
      }));
    });
  }

  it('rend `added` via joinedAt, et `modified` TOUJOURS vide — Participant n’a pas d’updatedAt', async () => {
    const prisma = makePrisma({
      participant: { findMany: participantFindManyByShape({
        roster: [participant('joiner', CONV_MINE, '2026-07-02T10:00:00Z')],
      }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=participants` });
    const p = res.json().data.collections.participants;
    expect(p.added.map((x: any) => x.id)).toEqual(['joiner']);
    expect(p.modified).toEqual([]);
    await app.close();
  });

  it('un participant ANONYME reste MASQUÉ — même viewer null pour tout le roster', async () => {
    const prisma = makePrisma({
      participant: { findMany: participantFindManyByShape({
        roster: [participant('other', CONV_MINE, '2026-07-02T10:00:00Z')],
      }) },
      user: { findMany: jest.fn<any>().mockResolvedValue([]) }, // jamais interrogé côté anonyme (viewer null ⇒ court-circuit)
    });
    const app = await buildApp(prisma, { userId: USER_ID, type: 'user' }); // rang non-admin implicite (registeredUser absent)

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=participants` });
    const row = res.json().data.collections.participants.added[0];
    // Le rang Prisma dit `isOnline: true` ; sans viewer résolu en compte
    // (aucun `registeredUser.role` dans ce contexte de test), la loi masque —
    // la ligne servie ne doit JAMAIS refléter la colonne brute.
    expect(row.isOnline).toBe(false);
    expect(row.lastActiveAt).toBeNull();
    await app.close();
  });

  it('un viewer ADMIN voit la présence RÉELLE du roster', async () => {
    const prisma = makePrisma({
      participant: { findMany: participantFindManyByShape({
        roster: [participant('other', CONV_MINE, '2026-07-02T10:00:00Z')],
      }) },
      user: { findMany: jest.fn<any>().mockResolvedValue([]) }, // deactivated-check : personne
    });
    const app = await buildApp(prisma, {
      userId: USER_ID, type: 'user', registeredUser: { role: 'ADMIN' },
    });

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=participants` });
    const row = res.json().data.collections.participants.added[0];
    expect(row.isOnline).toBe(true);
    expect(row.lastActiveAt).toBe('2026-07-02T09:00:00.000Z');
    await app.close();
  });

  it('rend les départs (`leftAt`/`bannedAt`) comme tombstones — jamais `deletedForMe`, qui n’est pas un état du ROSTER', async () => {
    const prisma = makePrisma({
      participant: { findMany: participantFindManyByShape({
        departures: [{ id: 'p-left', conversationId: CONV_MINE, leftAt: new Date('2026-07-03T00:00:00Z'), bannedAt: null }],
      }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=participants` });
    const p = res.json().data.collections.participants;
    expect(p.deleted).toEqual([
      { id: 'p-left', conversationId: CONV_MINE, deletedAt: '2026-07-03T00:00:00.000Z' },
    ]);
    await app.close();
  });

  it('RLS fail-closed : le roster de B ne sort jamais pour un participant de A seul', async () => {
    const prisma = makePrisma({
      participant: { findMany: participantFindManyByShape({
        roster: [
          participant('in-mine', CONV_MINE, '2026-07-02T10:00:00Z'),
          participant('in-other', CONV_OTHER, '2026-07-02T10:00:00Z'),
        ],
      }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=participants` });
    const ids = res.json().data.collections.participants.added.map((x: any) => x.id);
    expect(ids).toEqual(['in-mine']);
    expect(ids).not.toContain('in-other');
    await app.close();
  });
});

// ─── gap detection ──────────────────────────────────────────────────────────

describe('GET /sync — le gap gouverne les QUATRE collections identiquement', () => {
  it('hasGap court-circuite conversations, messages, reactions ET participants', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: BigInt(50_000) }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations,messages,reactions,participants&seq=1`,
    });
    const data = res.json().data;
    expect(data.hasGap).toBe(true);
    for (const name of ['conversations', 'messages', 'reactions', 'participants']) {
      expect(data.collections[name]).toEqual({ added: [], modified: [], deleted: [], truncated: false, nextCursor: null });
    }
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});
