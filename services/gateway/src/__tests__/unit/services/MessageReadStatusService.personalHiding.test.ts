/**
 * Les trois compteurs de non-lus et le masquage personnel.
 *
 * Le cycle 108 a rendu les SEPT surfaces de lecture honnêtes : « supprimer pour
 * moi » et « effacer l'historique » retirent enfin le contenu de la liste, de la
 * recherche, du fil, du delta `/sync` et des deux aperçus. Il a laissé écrit, dans
 * `SERVICE_LAYER_UNCOVERED`, que la couche service restait dehors — et
 * nommément que `MessageReadStatusService` compte les non-lus avec pour seul
 * plancher le curseur de lecture.
 *
 * Ce n'est pas « un défaut de moins que le contenu ». C'est un défaut d'une autre
 * nature, parce que les trois compteurs ne sont pas trois copies d'un même
 * nombre : ils sont trois CHEMINS vers le même badge, et ils se contredisent.
 *
 *   - `getUnreadCountsForUser`  → le badge de la LISTE de conversations ;
 *   - `getUnreadCount`          → le badge au retour d'un marquage de lecture ;
 *   - `getUnreadCountsForParticipants` → le badge POUSSÉ en temps réel sur
 *     `conversation:unread-updated`, à chaque `message:new`.
 *
 * Un utilisateur qui efface son historique alors qu'il a cinq messages non lus
 * garde un badge à 5 sur une liste vide — un compteur que défiler ne peut pas
 * éteindre, puisqu'il n'y a plus rien à défiler. Et le corriger sur UN chemin
 * seulement serait pire que ne rien corriger : la liste dirait 0 pendant que la
 * poussée temps réel dirait 6 au message suivant.
 *
 * Les témoins ci-dessous tiennent donc les TROIS chemins sur le même invariant :
 * le compteur ne compte que ce que la liste montrerait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn(),
  })),
}));

const CONV = '507f1f77bcf86cd799439012';
const USER = '507f1f77bcf86cd799439021';
const PARTICIPANT = '507f1f77bcf86cd799439011';
const OTHER_PARTICIPANT = '507f1f77bcf86cd799439015';
const OTHER_USER = '507f1f77bcf86cd799439022';

const at = (iso: string) => new Date(iso);

type PrismaOverrides = {
  cursor?: unknown;
  cursors?: unknown[];
  participant?: unknown;
  participants?: unknown[];
  messages?: Array<{ id: string; createdAt: Date; senderId: string }>;
  count?: number;
  prefs?: Array<{ userId?: string; conversationId?: string; clearHistoryBefore: Date | null }>;
  deletions?: Array<{ userId?: string; messageId: string; message?: { conversationId: string } }>;
};

type Args = Record<string, never> | Record<string, unknown>;

const makePrisma = (over: PrismaOverrides) => ({
  conversationReadCursor: {
    findUnique: jest.fn(async (_args: Args) => over.cursor ?? null),
    findMany: jest.fn(async (_args: Args) => over.cursors ?? []),
  },
  participant: {
    findFirst: jest.fn(async (_args: Args) => over.participant ?? null),
    findMany: jest.fn(async (_args: Args) => over.participants ?? []),
  },
  message: {
    count: jest.fn(async (_args: Args) => over.count ?? 0),
    findMany: jest.fn(async (_args: Args) => over.messages ?? []),
  },
  userConversationPreferences: {
    findFirst: jest.fn(async (_args: Args) => over.prefs?.[0] ?? null),
    findMany: jest.fn(async (_args: Args) => over.prefs ?? []),
  },
  userMessageDeletion: {
    findMany: jest.fn(async (_args: Args) => over.deletions ?? []),
  },
});

/** Les arguments Prisma d'un appel, sans le bruit de typage des mocks. */
const callArgs = (
  mock: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } },
  index = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => mock.mock.calls[index]?.[0];

const serviceOn = (prisma: ReturnType<typeof makePrisma>) =>
  new MessageReadStatusService(prisma as never);

beforeEach(() => {
  jest.clearAllMocks();
  (MessageReadStatusService as unknown as { recentActionCache: Map<string, unknown> })
    .recentActionCache.clear();
});

describe('getUnreadCount — le compteur d\'une conversation', () => {
  it('ne compte pas les messages effacés par « effacer l\'historique »', async () => {
    const cutoff = at('2026-05-21T12:00:00.000Z');
    const prisma = makePrisma({
      cursor: { lastReadMessageCreatedAt: at('2026-05-21T10:00:00.000Z'), lastReadAt: null },
      participant: { id: PARTICIPANT, userId: USER, joinedAt: at('2026-04-01T00:00:00.000Z') },
      prefs: [{ clearHistoryBefore: cutoff }],
      count: 0,
    });

    await serviceOn(prisma).getUnreadCount(USER, CONV);

    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        conversationId: CONV,
        deletedAt: null,
        senderId: { not: PARTICIPANT },
        createdAt: { gte: cutoff },
      },
    });
  });

  it('garde le plancher du curseur quand il est PLUS STRICT que la coupure d\'historique', async () => {
    const readFloor = at('2026-05-21T14:00:00.000Z');
    const prisma = makePrisma({
      cursor: { lastReadMessageCreatedAt: readFloor, lastReadAt: null },
      participant: { id: PARTICIPANT, userId: USER, joinedAt: null },
      prefs: [{ clearHistoryBefore: at('2026-05-21T12:00:00.000Z') }],
      count: 0,
    });

    await serviceOn(prisma).getUnreadCount(USER, CONV);

    const where = callArgs(prisma.message.count).where;
    expect(where.createdAt).toEqual({ gt: readFloor });
  });

  it('ne compte pas les messages retirés de la vue par « supprimer pour moi »', async () => {
    const prisma = makePrisma({
      cursor: null,
      participant: { id: PARTICIPANT, userId: USER, joinedAt: at('2026-04-01T00:00:00.000Z') },
      deletions: [{ messageId: 'm7' }, { messageId: 'm9' }],
      count: 0,
    });

    await serviceOn(prisma).getUnreadCount(USER, CONV);

    const where = callArgs(prisma.message.count).where;
    expect(where.id).toEqual({ notIn: ['m7', 'm9'] });
  });

  it('ne consulte aucune des deux tables pour un participant anonyme', async () => {
    const prisma = makePrisma({
      cursor: null,
      participant: { id: PARTICIPANT, userId: null, joinedAt: at('2026-04-01T00:00:00.000Z') },
      count: 4,
    });

    const count = await serviceOn(prisma).getUnreadCount(PARTICIPANT, CONV);

    expect(count).toBe(4);
    expect(prisma.userConversationPreferences.findFirst).not.toHaveBeenCalled();
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });
});

describe('getUnreadCountsForUser — le badge de la liste de conversations', () => {
  const OTHER_CONV = '507f1f77bcf86cd799439099';

  it('applique la coupure d\'historique de CHAQUE conversation, pas une seule pour toutes', async () => {
    const cutoff = at('2026-05-21T12:00:00.000Z');
    const prisma = makePrisma({
      participants: [
        { id: PARTICIPANT, userId: USER, conversationId: CONV, joinedAt: null },
        { id: OTHER_PARTICIPANT, userId: USER, conversationId: OTHER_CONV, joinedAt: null },
      ],
      cursors: [],
      prefs: [{ conversationId: CONV, clearHistoryBefore: cutoff }],
      count: 0,
    });

    await serviceOn(prisma).getUnreadCountsForUser(USER, [CONV, OTHER_CONV]);

    const wheres = prisma.message.count.mock.calls.map((_c, i) => callArgs(prisma.message.count, i).where);
    const hidden = wheres.find((w) => w.conversationId === CONV);
    const untouched = wheres.find((w) => w.conversationId === OTHER_CONV);
    expect(hidden.createdAt).toEqual({ gte: cutoff });
    expect(untouched.createdAt).toBeUndefined();
  });

  it('retire les messages supprimés pour soi de la conversation qui les porte', async () => {
    const prisma = makePrisma({
      participants: [{ id: PARTICIPANT, userId: USER, conversationId: CONV, joinedAt: null }],
      cursors: [],
      deletions: [{ messageId: 'm3', message: { conversationId: CONV } }],
      count: 0,
    });

    await serviceOn(prisma).getUnreadCountsForUser(USER, [CONV]);

    expect(callArgs(prisma.message.count).where.id).toEqual({ notIn: ['m3'] });
  });

  it('ne consulte aucune des deux tables quand l\'appelant est un participant sans compte', async () => {
    const prisma = makePrisma({
      participants: [{ id: PARTICIPANT, userId: null, conversationId: CONV, joinedAt: null }],
      cursors: [],
      count: 2,
    });

    const counts = await serviceOn(prisma).getUnreadCountsForUser(PARTICIPANT, [CONV]);

    expect(counts.get(CONV)).toBe(2);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });
});

describe('getUnreadCountsForParticipants — le badge POUSSÉ à chaque message', () => {
  const rows = [
    { id: 'm1', createdAt: at('2026-05-21T11:00:00.000Z'), senderId: OTHER_PARTICIPANT },
    { id: 'm2', createdAt: at('2026-05-21T12:00:00.000Z'), senderId: OTHER_PARTICIPANT },
    { id: 'm3', createdAt: at('2026-05-21T13:00:00.000Z'), senderId: OTHER_PARTICIPANT },
  ];

  const participants = [
    { id: PARTICIPANT, userId: USER, joinedAt: at('2026-04-01T00:00:00.000Z') },
  ];

  it('compte les trois messages quand rien n\'est masqué', async () => {
    const prisma = makePrisma({ cursors: [], messages: rows });

    const counts = await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    expect(counts.get(PARTICIPANT)).toBe(3);
  });

  it('exclut les messages antérieurs à la coupure d\'historique, borne INCLUSIVE', async () => {
    const prisma = makePrisma({
      cursors: [],
      messages: rows,
      prefs: [{ userId: USER, clearHistoryBefore: at('2026-05-21T12:00:00.000Z') }],
    });

    const counts = await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    // m2 est exactement à la coupure : `clearHistoryBefore` masque ce qui est
    // STRICTEMENT antérieur (`gte` côté Prisma), donc m2 et m3 restent.
    expect(counts.get(PARTICIPANT)).toBe(2);
  });

  it('exclut les messages supprimés pour soi', async () => {
    const prisma = makePrisma({
      cursors: [],
      messages: rows,
      deletions: [{ userId: USER, messageId: 'm2' }],
    });

    const counts = await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    expect(counts.get(PARTICIPANT)).toBe(2);
  });

  it('n\'applique le masquage d\'un participant qu\'à LUI — les autres gardent leur compte', async () => {
    const prisma = makePrisma({
      cursors: [],
      messages: rows,
      deletions: [{ userId: USER, messageId: 'm1' }, { userId: USER, messageId: 'm2' }],
    });

    const counts = await serviceOn(prisma).getUnreadCountsForParticipants(
      [
        ...participants,
        { id: OTHER_PARTICIPANT, userId: OTHER_USER, joinedAt: at('2026-04-01T00:00:00.000Z') },
      ],
      CONV
    );

    expect(counts.get(PARTICIPANT)).toBe(1);
    // OTHER_PARTICIPANT est l'auteur des trois messages : son propre envoi ne
    // compte pas, et le masquage d'autrui ne le touche pas.
    expect(counts.get(OTHER_PARTICIPANT)).toBe(0);
  });

  it('ne demande pas les ids des messages quand personne ne masque de message individuel', async () => {
    const prisma = makePrisma({
      cursors: [],
      messages: rows,
      prefs: [{ userId: USER, clearHistoryBefore: at('2026-05-21T12:00:00.000Z') }],
    });

    await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    expect(callArgs(prisma.message.findMany).select).toEqual({
      createdAt: true,
      senderId: true,
    });
  });

  it('ne consulte aucune des deux tables pour une conversation 100 % anonyme', async () => {
    const prisma = makePrisma({ cursors: [], messages: rows });

    await serviceOn(prisma).getUnreadCountsForParticipants(
      [{ id: PARTICIPANT, userId: null, joinedAt: null }],
      CONV
    );

    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('remonte la borne basse de la requête quand la coupure est PLUS HAUTE que tous les curseurs', async () => {
    const cutoff = at('2026-05-21T12:00:00.000Z');
    const prisma = makePrisma({
      cursors: [],
      messages: rows,
      prefs: [{ userId: USER, clearHistoryBefore: cutoff }],
    });

    await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    // Le plancher de lecture est `joinedAt` (2026-04-01) ; la coupure inclusive
    // à 12:00 équivaut à un plancher exclusif à 11:59:59.999.
    const where = callArgs(prisma.message.findMany).where;
    expect(where.createdAt).toEqual({ gt: new Date(cutoff.getTime() - 1) });
  });

  it('sert le compte non filtré si la lecture du masquage échoue', async () => {
    const prisma = makePrisma({ cursors: [], messages: rows });
    prisma.userMessageDeletion.findMany.mockRejectedValue(new Error('mongo down') as never);

    const counts = await serviceOn(prisma).getUnreadCountsForParticipants(participants, CONV);

    expect(counts.get(PARTICIPANT)).toBe(3);
  });
});
