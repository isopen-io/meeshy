/**
 * **Une seule adresse pour changer un participant** —
 * `PATCH /conversations/:id/participants/:participantKey` (#4176, critères 1,
 * 2, 3 et 6).
 *
 * Quatre routes changeaient un participant : `…/rights`, `…/role`, `…/ban`,
 * `…/unban`. Quatre seuils, DEUX natures d'identifiant dans le même segment
 * d'URL (`:participantId` porte un `Participant.id`, `:userId` un `User.id`),
 * et une conséquence mesurable — **`/role` ne pouvait pas atteindre un visiteur
 * sans compte** que `/ban` et `DELETE` résolvaient, eux, sous les deux
 * colonnes.
 *
 * Ce que ces témoins mesurent, et pourquoi chacun :
 *
 * 1. **La route existe et DISPATCHE** — un corps par geste, quatre gestes.
 * 2. **Le gate par CHAMP** est celui du tableau de l'issue, opposé à travers
 *    la route fusionnée exactement comme à travers son alias.
 * 3. **`400 MIXED_AUTHORITY`** — un corps qui mêle deux GESTES est refusé en
 *    bloc, **et la ligne ne bouge pas**. Un refus qui répond 403/400 après
 *    avoir écrit n'est pas un refus.
 * 4. **Les effets de bord, champ par champ** (critère 3) : `rights.*` diffuse
 *    à DEUX audiences avec charge réduite en salle ; `historyVisibleFrom` n'est
 *    JAMAIS en salle ; `role` diffuse en salle seule ; `bannedAt` ferme le lien
 *    d'entrée et met fin à l'appartenance ; `bannedAt: null` re-`join` les
 *    sockets.
 * 5. **La PARITÉ de charge servie avec l'alias** (critère 6) : pour un même
 *    scénario, `data` servi par la route fusionnée est IDENTIQUE à celui servi
 *    par l'alias. C'est le témoin de non-TRONCATURE : un schéma de réponse
 *    partiel sur la route neuve ferait diverger les deux corps, et rien
 *    d'autre ne le dirait — `fast-json-stringify` supprime en SILENCE.
 * 6. **La clé résout les deux colonnes**, et le témoin vise un participant
 *    **SANS COMPTE** : sur un membre inscrit, `User.id` et `Participant.id`
 *    mènent tous deux à une ligne et le témoin passerait au vert sans rien
 *    prouver.
 *
 * Le double Prisma répond au `where` — un double qui rend la même ligne à
 * toutes les questions ferait croire au handler que l'appelant se vise
 * lui-même, et laisserait passer exactement les défauts mesurés ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const CONV_ID = '507f1f77bcf86cd799439033';
const CALLER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439022';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390cc';
const SHARE_LINK_ID = '507f1f77bcf86cd7994390dd';

/** Un instant PASSÉ : le schéma refuse une date à venir (mute déguisé en octroi). */
const HIER = new Date(Date.now() - 86_400_000).toISOString();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async () => CONV_ID),
  invalidateConversationIdCache: jest.fn(),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn(),
}));

const mockEndMembership = jest.fn<any>(async () => undefined);
jest.mock('../../../../socketio/endConversationMembership', () => ({
  endConversationMembership: (...args: any[]) => mockEndMembership(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: jest.fn(async () => true),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    resolveForTargets: async () => new Map(),
  }),
}));

import { PARTICIPANT_RIGHT_NAMES } from '../../../../services/participantRights';
import { CHAMPS_DE_PATCH, lireGesteDeParticipant } from '../../../../routes/conversations/utils/participant-patch-champs';
import { participantPatchBodySchema } from '../../../../routes/conversations/participant-patch';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { registerParticipantRoleRoute } from '../../../../routes/conversations/participant-role';
import { registerBanRoutes } from '../../../../routes/conversations/ban';

// ─── Doubles ──────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  userId: string | null;
  role: string;
  isActive?: boolean;
  leftAt?: Date | null;
  bannedAt?: Date | null;
  displayName?: string | null;
  shareLinkId?: string | null;
  type?: string;
  permissions?: Record<string, boolean>;
  anonymousSession?: { rights?: Record<string, boolean> } | null;
  historyVisibleFrom?: Date | null;
};

const filled = (row: Row) => ({
  conversationId: CONV_ID,
  isActive: true,
  leftAt: null,
  bannedAt: null,
  displayName: 'Nom',
  shareLinkId: null,
  type: 'user',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
    canViewHistory: true,
  },
  anonymousSession: null,
  historyVisibleFrom: null,
  joinedAt: new Date('2026-01-01'),
  ...row,
  user: row.userId
    ? {
        id: row.userId,
        username: 'u',
        displayName: 'U',
        firstName: 'U',
        lastName: 'U',
        avatar: null,
        role: 'USER',
        isOnline: false,
        lastActiveAt: null,
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deactivatedAt: null,
      }
    : null,
});

/**
 * Répond au `where`, comme la vraie requête : `userId` d'abord (le cas
 * courant), `id` ensuite — c'est exactement la question que pose
 * `resolveTargetParticipant` quand la première ne rend rien, et c'est elle qui
 * atteint un visiteur sans compte.
 */
function makePrisma(rows: Row[]) {
  const full = rows.map(filled);
  const writes: { where: any; data: any }[] = [];
  const matches = (row: any, where: any) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.id === undefined || row.id === where.id) &&
    (where.isActive === undefined || row.isActive === where.isActive);

  return {
    writes,
    rows: full,
    participant: {
      findFirst: jest.fn(async ({ where }: any) => full.find((row) => matches(row, where)) ?? null),
      findUnique: jest.fn(async ({ where }: any) => full.find((row) => row.id === where.id) ?? null),
      // L'écriture MUTE la ligne stockée : un double qui garde la ligne intacte
      // laisse un témoin d'effet passer au vert sans que la route ait rien fait.
      update: jest.fn(async ({ where, data }: any) => {
        writes.push({ where, data });
        const row = full.find((r) => r.id === where.id);
        Object.assign(row as object, data);
        return row;
      }),
      // Répond au `where`, **filtre de rang compris**. Le noyau des droits
      // demande les seuls HÔTES (`role: { in: [...] }`) pour son troisième
      // éventail ; un double qui rend tout le monde ferait recevoir à
      // l'intéressé une SECONDE charge, et le témoin des deux audiences
      // compterait un éventail qui n'existe pas.
      findMany: jest.fn(async ({ where }: any) =>
        full
          .filter((row) => row.isActive)
          .filter((row) => !where?.role?.in || where.role.in.includes(row.role))
          .map((row) => ({ id: row.id, userId: row.userId, role: row.role, user: { role: 'USER' } })),
      ),
    },
    conversationShareLink: {
      update: jest.fn(async (_args: { where: { id: string }; data: { isActive: boolean } }) => ({
        id: SHARE_LINK_ID,
        isActive: false,
      })),
    },
  };
}

type Emitted = { rooms: string[]; event: string; payload: any };

function makeSocket(emitted: Emitted[], joins: string[][]) {
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: any) => emitted.push({ rooms, event, payload }),
  });
  const io = {
    to: (room: string) => chain([room]),
    in: () => ({ fetchSockets: async () => [] }),
  };
  return {
    getIO: () => io,
    invalidateParticipantCache: jest.fn(),
    joinUserToConversationRoom: jest.fn(async (userId: string, conversationId: string) => {
      joins.push([userId, conversationId]);
    }),
  };
}

async function buildApp(
  prisma: any,
  emitted: Emitted[] = [],
  joins: string[][] = [],
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: CALLER_ID,
      registeredUser: { id: CALLER_ID, role: 'USER' },
    };
  };
  app.decorate('socketIOHandler', { getManager: () => makeSocket(emitted, joins) } as any);
  app.decorate('notificationService', null as any);
  registerParticipantWriteRoutes(app, prisma, requiredAuth);
  registerParticipantRoleRoute(app, prisma, requiredAuth);
  registerBanRoutes(app, prisma, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

const caller = (role: string): Row => ({ id: 'part-caller', userId: CALLER_ID, role });
const target = (role: string, over: Partial<Row> = {}): Row =>
  ({ id: 'part-target', userId: TARGET_ID, role, displayName: 'Bob', ...over });
/** Un visiteur venu par un lien : AUCUNE ligne `User`, donc `Participant.id` pour seule identité. */
const visiteur = (over: Partial<Row> = {}): Row => ({
  id: ANON_PARTICIPANT_ID,
  userId: null,
  role: 'member',
  type: 'anonymous',
  displayName: 'Invité',
  shareLinkId: SHARE_LINK_ID,
  ...over,
});

const PATCH = (key: string) => `/conversations/${CONV_ID}/participants/${key}`;

// ─── 1. La route existe et dispatche vers les quatre gestes ───────────────────

describe('PATCH …/participants/:participantKey — une adresse, quatre gestes', () => {
  it('change un RANG', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { role: 'moderator' } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe('moderator');
    expect(prisma.writes).toContainEqual({ where: { id: 'part-target' }, data: { role: 'moderator' } });
  });

  it('BANNIT quand `bannedAt` porte une date', async () => {
    const prisma = makePrisma([caller('admin'), target('member', { shareLinkId: SHARE_LINK_ID })]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: HIER } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.bannedAt).toEqual(expect.any(String));
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeInstanceOf(Date);
  });

  it('LÈVE le bannissement quand `bannedAt` vaut null', async () => {
    const prisma = makePrisma([
      caller('admin'),
      target('member', { bannedAt: new Date('2026-01-02'), isActive: false, leftAt: new Date('2026-01-02') }),
    ]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: null } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeNull();
  });

  it('change les DROITS d\'un visiteur sans compte', async () => {
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { canSendMessages: false },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.rights.canSendMessages).toBe(false);
  });

  it('octroie l\'HISTORIQUE par date', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH('part-target'),
      payload: { historyVisibleFrom: HIER },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.historyVisibleFrom).toBe(new Date(HIER).toISOString());
  });
});

// ─── 1 bis. La SURFACE — la route est adressable, et les alias survivent ─────

/**
 * Le témoin de SURFACE que le CLAUDE.md du gateway réclame : « cette route
 * est-elle enregistrée ? ». Il NOMME le chemin, là où le compteur de
 * `unit/routes/participants.test.ts` (dix routes) passerait au vert sur
 * n'importe quel PATCH ajouté au module.
 *
 * Il affirme AUSSI que les quatre alias survivent — la fusion PRÉSERVE, l'issue
 * leur donnant deux versions clientes.
 */
describe('PATCH …/:participantKey — la surface', () => {
  it("l'adresse unique est servie, et les quatre alias avec elle", async () => {
    const app = await buildApp(makePrisma([caller('admin')]));
    const servie = (url: string) => app.hasRoute({ method: 'PATCH', url });

    // La route fusionnée et les quatre alias occupent le MÊME créneau de
    // paramètre sous trois noms (`:participantKey`, `:participantId`,
    // `:userId`) : l'arbre radix de Fastify les fusionne en un seul nœud, et
    // c'est ce qui rend l'adresse unique montable SANS toucher aux alias.
    expect(servie('/conversations/:id/participants/:participantKey')).toBe(true);
    expect(servie('/conversations/:id/participants/:participantId/rights')).toBe(true);
    expect(servie('/conversations/:id/participants/:userId/role')).toBe(true);
    expect(servie('/conversations/:id/participants/:userId/ban')).toBe(true);
    expect(servie('/conversations/:id/participants/:userId/unban')).toBe(true);
    // Le témoin discrimine : `hasRoute` refuse une adresse non montée.
    expect(servie('/conversations/:id/participants/:userId/nope')).toBe(false);

    await app.close();
  });
});

// ─── 2. Le gate par CHAMP — le tableau de l'issue, opposé sur la route neuve ──

describe('PATCH …/:participantKey — chaque champ oppose SON rang', () => {
  it('refuse à un MODÉRATEUR l\'octroi d\'historique (ADMIN), et la ligne ne bouge pas', async () => {
    const prisma = makePrisma([caller('moderator'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH('part-target'),
      payload: { historyVisibleFrom: HIER },
    });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('HISTORY_GRANT_REQUIRES_ADMIN');
    expect(prisma.writes).toHaveLength(0);
  });

  it('laisse un MODÉRATEUR poser un droit BOOLÉEN — le plancher des droits est MODERATOR', async () => {
    const prisma = makePrisma([caller('moderator'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { canSendMessages: false },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
  });

  it('refuse à un MODÉRATEUR de bannir un ADMIN, et la ligne ne bouge pas', async () => {
    const prisma = makePrisma([caller('moderator'), target('admin')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: HIER } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(prisma.writes).toHaveLength(0);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeNull();
  });

  it('refuse à un ADMIN de rétrograder un autre ADMIN, et la ligne ne bouge pas', async () => {
    const prisma = makePrisma([caller('admin'), target('admin')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { role: 'member' } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(prisma.writes).toHaveLength(0);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.role).toBe('admin');
  });

  it('refuse à un ADMIN de toucher au CRÉATEUR, et la ligne ne bouge pas', async () => {
    const prisma = makePrisma([caller('admin'), target('creator')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { role: 'member' } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(prisma.writes).toHaveLength(0);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.role).toBe('creator');
  });

  it('refuse à un simple MEMBRE tout geste — le plancher tombe avant la cible', async () => {
    const prisma = makePrisma([caller('member'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: HIER } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(prisma.writes).toHaveLength(0);
  });
});

// ─── 3. MIXED_AUTHORITY — une mutation ne se juge pas sur son champ le moins gardé

describe('PATCH …/:participantKey — un corps qui mêle deux GESTES est refusé en bloc', () => {
  it('`{ role, canSendMessages }` ⇒ 400 MIXED_AUTHORITY, AUCUNE écriture', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(TARGET_ID),
      payload: { role: 'moderator', canSendMessages: false },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MIXED_AUTHORITY');
    expect(prisma.writes).toHaveLength(0);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.role).toBe('member');
  });

  it('`{ role, bannedAt }` ⇒ 400 MIXED_AUTHORITY — deux écritures, deux éventails', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(TARGET_ID),
      payload: { role: 'moderator', bannedAt: HIER },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MIXED_AUTHORITY');
    expect(prisma.writes).toHaveLength(0);
  });

  it('`{ canSendMessages, historyVisibleFrom }` NE mêle rien — un seul geste, gate par champ', async () => {
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { canSendMessages: false, historyVisibleFrom: HIER },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.rights.canSendMessages).toBe(false);
    expect(res.json().data.historyVisibleFrom).toBe(new Date(HIER).toISOString());
  });

  it('un `bannedAt` mal formé est REFUSÉ, jamais lu comme une intention de bannir', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: 'demain' } });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_BANNED_AT');
    // L'instant ÉCRIT est celui du serveur ; une chaîne illisible ne doit pas
    // pour autant valoir « bannis », sinon une faute de frappe bannit.
    expect(prisma.writes).toHaveLength(0);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeNull();
  });

  it('un corps VIDE est refusé par le schéma, jamais servi comme un geste nul', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: {} });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(prisma.writes).toHaveLength(0);
  });
});

// ─── 3 bis. L'asymétrie ban/unban, MESURÉE sur la route fusionnée ────────────

/**
 * L'issue #4176 décrit une asymétrie RÉELLE au moment de son écriture : poser un
 * bannissement exigeait un rang strictement supérieur, le LEVER exigeait ADMIN —
 * **un modérateur posait donc un bannissement qu'il ne pouvait pas lever**.
 *
 * La décision porteur du 2026-08-29 l'a supprimée dans le sens qui n'élargit
 * rien : *on lève un bannissement qu'on aurait pu poser*. Ces deux témoins
 * mesurent ce que ce choix produit EXACTEMENT, à travers la route fusionnée —
 * l'un dit ce qu'il rend possible, l'autre ce qu'il coûte.
 */
describe("PATCH …/:participantKey — poser et lever un bannissement s'autorisent pareil", () => {
  it('un MODÉRATEUR lève le bannissement qu\'il aurait pu poser', async () => {
    const prisma = makePrisma([
      caller('moderator'),
      target('member', { bannedAt: new Date('2026-01-02'), isActive: false, leftAt: new Date('2026-01-02') }),
    ]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: null } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeNull();
  });

  it("mais un ADMIN ne libère PAS un ADMIN banni — le prix assumé de la symétrie", async () => {
    const prisma = makePrisma([
      caller('admin'),
      target('admin', { bannedAt: new Date('2026-01-02'), isActive: false, leftAt: new Date('2026-01-02') }),
    ]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: null } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(prisma.writes).toHaveLength(0);
    // La ligne ne bouge pas : seul qui pouvait le bannir — le CRÉATEUR — le relève.
    expect(prisma.rows.find((r) => r.id === 'part-target')?.bannedAt).toBeInstanceOf(Date);
  });
});

// ─── 4. La clé résout les DEUX colonnes — sur un participant SANS COMPTE ──────

describe('PATCH …/:participantKey — la clé résout les deux colonnes', () => {
  it('atteint un visiteur SANS COMPTE par son `Participant.id` pour le bannir', async () => {
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { bannedAt: HIER },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.participantId).toBe(ANON_PARTICIPANT_ID);
    // `userId` déclare un `User.id` : NUL sans compte, jamais le `Participant.id`.
    expect(res.json().data.userId).toBeNull();
  });

  it('atteint un membre INSCRIT par son `Participant.id` pour changer son rang', async () => {
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'PATCH', url: PATCH('part-target'), payload: { role: 'moderator' } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.participantId).toBe('part-target');
    expect(res.json().data.userId).toBe(TARGET_ID);
  });

  it('atteint un visiteur SANS COMPTE par ses DROITS via son `Participant.id`', async () => {
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { canSendFiles: false },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.participantId).toBe(ANON_PARTICIPANT_ID);
  });

  it('sur `role`, un visiteur sans compte est refusé pour la VRAIE raison, jamais par un 404 qui ment', async () => {
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { role: 'moderator' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('PARTICIPANT_HAS_NO_ACCOUNT');
  });
});

// ─── 5. Les effets de bord, CHAMP PAR CHAMP (critère 3) ──────────────────────

describe('PATCH …/:participantKey — les effets de bord survivent à la fusion', () => {
  it('`rights.*` diffuse à DEUX audiences, et la charge de SALLE est réduite', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma, emitted);
    await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { canSendMessages: false, historyVisibleFrom: HIER },
    });
    await app.close();

    const salle = emitted.filter((e) => e.rooms.includes(`conversation:${CONV_ID}`));
    const perso = emitted.filter((e) => e.rooms.includes(`user:${ANON_PARTICIPANT_ID}`));

    expect(salle).toHaveLength(1);
    expect(perso).toHaveLength(1);
    // #3898/#4009 — la salle ne voit NI la date NI le booléen jumeau.
    expect(salle[0].payload).not.toHaveProperty('historyVisibleFrom');
    expect(salle[0].payload.rights).not.toHaveProperty('canViewHistory');
    // L'intéressé reçoit la charge COMPLÈTE : c'est SA date.
    expect(perso[0].payload.historyVisibleFrom).toBe(new Date(HIER).toISOString());
  });

  it('`historyVisibleFrom` seul n\'est JAMAIS diffusé en salle', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma, emitted);
    await app.inject({ method: 'PATCH', url: PATCH('part-target'), payload: { historyVisibleFrom: HIER } });
    await app.close();

    const salle = emitted.filter((e) => e.rooms.includes(`conversation:${CONV_ID}`));
    expect(salle).toHaveLength(1);
    expect(salle[0].payload).not.toHaveProperty('historyVisibleFrom');
  });

  it('`role` diffuse en SALLE seule, et sans présence', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma, emitted);
    await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { role: 'moderator' } });
    await app.close();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toEqual([`conversation:${CONV_ID}`]);
    expect(emitted[0].event).toBe('participant:role-updated');
    expect(emitted[0].payload.participant).not.toHaveProperty('isOnline');
    expect(emitted[0].payload.participant).not.toHaveProperty('lastActiveAt');
  });

  it('`bannedAt` ferme le LIEN d\'entrée et met fin à l\'appartenance', async () => {
    mockEndMembership.mockClear();
    const emitted: Emitted[] = [];
    const prisma = makePrisma([caller('admin'), visiteur()]);
    const app = await buildApp(prisma, emitted);
    const res = await app.inject({
      method: 'PATCH',
      url: PATCH(ANON_PARTICIPANT_ID),
      payload: { bannedAt: HIER },
    });
    await app.close();

    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith({
      where: { id: SHARE_LINK_ID },
      data: { isActive: false },
    });
    expect(res.json().data.closedShareLinkId).toBe(SHARE_LINK_ID);
    expect(mockEndMembership).toHaveBeenCalledTimes(1);
    expect(emitted.some((e) => e.event === 'conversation:participant-banned')).toBe(true);
  });

  it('`bannedAt: null` re-`join` les sockets quand l\'appartenance est restaurée', async () => {
    const joins: string[][] = [];
    const prisma = makePrisma([
      caller('admin'),
      target('member', { bannedAt: new Date('2026-01-02'), isActive: false, leftAt: new Date('2026-01-02') }),
    ]);
    const app = await buildApp(prisma, [], joins);
    await app.inject({ method: 'PATCH', url: PATCH(TARGET_ID), payload: { bannedAt: null } });
    await app.close();

    expect(joins).toContainEqual([TARGET_ID, CONV_ID]);
  });
});

// ─── 6. La charge servie est celle de l'alias — rien n'est TRONQUÉ ────────────

/**
 * Le témoin de non-troncature (critère 6). `fast-json-stringify` supprime en
 * SILENCE tout ce qu'un schéma ne déclare pas : un schéma partiel sur la route
 * fusionnée servirait un corps amputé sans qu'aucune erreur ne le dise.
 *
 * Relever les clés à la main serait relever ce qu'on CROIT servi. La parité
 * avec l'alias les relève MÉCANIQUEMENT : les deux routes appellent le même
 * noyau sur le même double, donc toute clé que la fusionnée déclare en moins
 * fait diverger les deux corps.
 */
describe('PATCH …/:participantKey — `data` est IDENTIQUE à celui de l\'alias', () => {
  const parite = async (
    rows: Row[],
    key: string,
    corpsFusion: Record<string, unknown>,
    aliasUrl: (k: string) => string,
    corpsAlias: Record<string, unknown>,
  ) => {
    const prismaFusion = makePrisma(rows.map((r) => ({ ...r })));
    const appFusion = await buildApp(prismaFusion);
    const resFusion = await appFusion.inject({ method: 'PATCH', url: PATCH(key), payload: corpsFusion });
    await appFusion.close();

    const prismaAlias = makePrisma(rows.map((r) => ({ ...r })));
    const appAlias = await buildApp(prismaAlias);
    const resAlias = await appAlias.inject({ method: 'PATCH', url: aliasUrl(key), payload: corpsAlias });
    await appAlias.close();

    expect(resFusion.statusCode).toBe(200);
    expect(resAlias.statusCode).toBe(200);
    return { fusion: resFusion.json().data, alias: resAlias.json().data };
  };

  it('geste RANG', async () => {
    const { fusion, alias } = await parite(
      [caller('admin'), target('member')],
      TARGET_ID,
      { role: 'moderator' },
      (k) => `${PATCH(k)}/role`,
      { role: 'moderator' },
    );
    expect(Object.keys(fusion).sort()).toEqual(Object.keys(alias).sort());
    expect(fusion).toEqual(alias);
  });

  it('geste DROITS', async () => {
    const { fusion, alias } = await parite(
      [caller('admin'), visiteur()],
      ANON_PARTICIPANT_ID,
      { canSendMessages: false, historyVisibleFrom: HIER },
      (k) => `${PATCH(k)}/rights`,
      { canSendMessages: false, historyVisibleFrom: HIER },
    );
    expect(Object.keys(fusion).sort()).toEqual(Object.keys(alias).sort());
    expect(fusion).toEqual(alias);
  });

  it('geste BANNISSEMENT', async () => {
    const { fusion, alias } = await parite(
      [caller('admin'), visiteur()],
      ANON_PARTICIPANT_ID,
      { bannedAt: HIER },
      (k) => `${PATCH(k)}/ban`,
      {},
    );
    expect(Object.keys(fusion).sort()).toEqual(Object.keys(alias).sort());
    // `bannedAt` porte l'instant SERVEUR : les deux appels ne tombent pas à la
    // même milliseconde, donc c'est la FORME qui se compare, pas la valeur.
    expect(typeof fusion.bannedAt).toBe('string');
    expect({ ...fusion, bannedAt: null }).toEqual({ ...alias, bannedAt: null });
  });

  it('geste LEVÉE', async () => {
    const banni: Row = {
      id: 'part-target',
      userId: TARGET_ID,
      role: 'member',
      bannedAt: new Date('2026-01-02'),
      isActive: false,
      leftAt: new Date('2026-01-02'),
    };
    const { fusion, alias } = await parite(
      [caller('admin'), banni],
      TARGET_ID,
      { bannedAt: null },
      (k) => `${PATCH(k)}/unban`,
      {},
    );
    expect(Object.keys(fusion).sort()).toEqual(Object.keys(alias).sort());
    expect(fusion).toEqual(alias);
  });
});

// ─── 7. La LOI du corps, interrogée sans Fastify ─────────────────────────────

/**
 * `lireGesteDeParticipant` est la seule chose que la route fusionnée DÉCIDE
 * elle-même — tout le reste, elle le délègue aux quatre noyaux. Ces témoins-ci
 * la lisent comme une fonction : ils tiennent la table champ → geste, qui est
 * DÉRIVÉE de `PARTICIPANT_RIGHT_NAMES` et doit le rester. Un droit ajouté au
 * dépôt et rangé par erreur hors de la famille `rights` deviendrait, en
 * silence, un champ qui MÊLE — donc une mutation refusée en bloc sans raison.
 */
describe('lireGesteDeParticipant — la table champ → geste', () => {
  it('range TOUS les droits connus dans la famille `rights`, quel que soit leur nombre', () => {
    for (const nom of PARTICIPANT_RIGHT_NAMES) {
      expect(lireGesteDeParticipant({ [nom]: true })).toEqual({
        genre: 'geste',
        geste: 'rights',
        champs: [nom],
      });
    }
    // Les huit ensemble ne mêlent rien : une seule écriture, un seul éventail.
    const tous = Object.fromEntries(PARTICIPANT_RIGHT_NAMES.map((nom) => [nom, false]));
    expect(lireGesteDeParticipant(tous).genre).toBe('geste');
  });

  it('choisit le geste de `bannedAt` par sa VALEUR, jamais par sa présence', () => {
    expect(lireGesteDeParticipant({ bannedAt: HIER })).toMatchObject({ geste: 'ban' });
    expect(lireGesteDeParticipant({ bannedAt: null })).toMatchObject({ geste: 'unban' });
  });

  it('un champ posé à `undefined` est ABSENT — un objet partiel étalé ne mêle rien', () => {
    expect(lireGesteDeParticipant({ role: 'admin', bannedAt: undefined })).toMatchObject({ geste: 'role' });
    expect(lireGesteDeParticipant({ role: undefined })).toEqual({ genre: 'aucun' });
  });

  it('nomme les familles ET les champs du mélange — un refus qui ne dit pas quoi est un refus qu\'on rejoue', () => {
    expect(lireGesteDeParticipant({ role: 'admin', canSendMessages: false, bannedAt: null })).toEqual({
      genre: 'melange',
      familles: ['rights', 'role', 'ban'],
      champs: ['canSendMessages', 'role', 'bannedAt'],
    });
  });

  it('le corps admis déclare EXACTEMENT les champs de la loi', () => {
    // Les DEUX listes viennent de `PARTICIPANT_RIGHT_NAMES`, mais par deux
    // chemins : le schéma les étale, la loi les range dans une famille. Un
    // champ connu de la loi et absent du schéma serait REFUSÉ par Fastify
    // (`additionalProperties: false`) avant tout gate — une capacité perdue
    // que rien ne nommerait. L'inverse serait un champ admis qu'aucun geste ne
    // sait exécuter, donc un `400 NO_FIELD_NAMED` sur un corps que le schéma
    // vient d'accepter.
    expect(Object.keys(participantPatchBodySchema.properties).sort()).toEqual([...CHAMPS_DE_PATCH].sort());
  });

  it('un corps qui n\'est pas un objet ne fabrique aucun geste', () => {
    expect(lireGesteDeParticipant(null)).toEqual({ genre: 'aucun' });
    expect(lireGesteDeParticipant('role')).toEqual({ genre: 'aucun' });
    expect(lireGesteDeParticipant([{ role: 'admin' }])).toEqual({ genre: 'aucun' });
  });
});
