/**
 * #6501 — le pont ✦ survit à un expéditeur disparu.
 *
 * Sa fenêtre charge `sender` (relation REQUISE) : un seul message dont le
 * `Participant` a été effacé faisait rejeter la requête entière, et le journal
 * de staging disait « bridge pass failed, serving no bridge » pour TOUTES les
 * conversations du lot. La passe répare désormais la portée qu'elle lit et
 * rejoue sa fenêtre UNE fois ; toute autre erreur garde la posture d'échec
 * existante (une map vide, jamais un pont faux).
 *
 * La réparation qui tourne est la VRAIE, sur la base en mémoire : aucun module
 * n'est mocké, parce que sous `bun test` un module mocké le reste pour les
 * fichiers suivants du même processus. La PORTÉE se lit donc dans les lignes :
 * l'orphelin d'une conversation du lot est réparé, celui d'une conversation hors
 * du lot ne l'est pas.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ConversationBridgeService } from '../ConversationBridgeService';
import { makeOrphanedSenderDb, orphanedSenderPrismaError } from '../../__tests__/helpers/orphaned-sender-db';

const C0 = 'aaaaaaaaaaaaaaaaaaaaaa00';
const C1 = 'aaaaaaaaaaaaaaaaaaaaaa01';
const HORS_LOT = 'aaaaaaaaaaaaaaaaaaaaaa02';
const GHOST = 'bbbbbbbbbbbbbbbbbbbbbb00';
const GHOST_HORS_LOT = 'bbbbbbbbbbbbbbbbbbbbbb02';

const at = (iso: string) => new Date(iso);

const windowRow = (conversationId: string, id: string) => ({
  id,
  conversationId,
  senderId: GHOST,
  createdAt: at('2026-03-01T10:00:00.000Z'),
  messageType: 'text',
  sender: { displayName: 'Compte supprimé', nickname: null, user: null },
  attachments: [],
});

/**
 * Deux conversations non lues ; la fenêtre de messages rejette d'abord avec
 * `firstRead`, puis sert ses lignes. La base porte un orphelin DANS le lot et un
 * orphelin HORS du lot.
 */
const makeBridgePrisma = (firstRead: Error) => {
  const db = makeOrphanedSenderDb({
    conversations: [C0, C1, HORS_LOT].map((id) => ({
      id,
      lastMessageAt: at('2026-03-01T10:00:00.000Z'),
      createdAt: at('2026-01-01T00:00:00.000Z'),
    })),
    messages: [
      { id: 'orphelin', conversationId: C0, senderId: GHOST, messageSource: 'agent', createdAt: at('2026-03-01T09:00:00.000Z') },
      {
        id: 'hors-lot',
        conversationId: HORS_LOT,
        senderId: GHOST_HORS_LOT,
        messageSource: 'agent',
        createdAt: at('2026-03-01T09:00:00.000Z'),
      },
    ],
  });
  const prisma = {
    ...db.prisma,
    participant: {
      ...db.prisma.participant,
      findMany: jest.fn(async () => [
        { id: 'p0', userId: 'u-viewer', conversationId: C0, joinedAt: at('2026-01-01T00:00:00.000Z'), isActive: true },
        { id: 'p1', userId: 'u-viewer', conversationId: C1, joinedAt: at('2026-01-01T00:00:00.000Z'), isActive: true },
      ]),
    },
    conversationReadCursor: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    message: {
      ...db.prisma.message,
      findMany: jest.fn<any>().mockRejectedValueOnce(firstRead).mockResolvedValue([windowRow(C0, 'm0'), windowRow(C1, 'm1')]),
      count: jest.fn(async () => 0),
    },
  } as any;
  return { prisma, db };
};

const tombstoneOf = (db: ReturnType<typeof makeOrphanedSenderDb>, id: string) =>
  db.state.participants.some((participant) => participant.id === id);

const candidates = [
  { conversationId: C0, unreadCount: 1 },
  { conversationId: C1, unreadCount: 1 },
];

describe('#6501 — buildBridgeData et un expéditeur disparu', () => {
  it('répare les conversations de la passe, rejoue la fenêtre, et sert le pont', async () => {
    const { prisma, db } = makeBridgePrisma(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeData({ viewerId: 'u-viewer', candidates });

    expect(result.size).toBe(2);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    expect(tombstoneOf(db, GHOST)).toBe(true);
    expect(tombstoneOf(db, GHOST_HORS_LOT)).toBe(false);
  });

  it("une erreur ÉTRANGÈRE garde la posture d'échec — aucune réparation, aucun pont", async () => {
    const { prisma, db } = makeBridgePrisma(new Error('connection reset'));

    const result = await new ConversationBridgeService(prisma).buildBridgeData({ viewerId: 'u-viewer', candidates });

    expect(result.size).toBe(0);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });
});

describe('#6501 — buildBridgeDataForViewers et un expéditeur disparu', () => {
  const viewerPrisma = (firstRead: Error) => {
    const built = makeBridgePrisma(firstRead);
    built.prisma.participant.findMany = jest.fn(async () => [
      { id: 'p0', userId: 'u-viewer', joinedAt: at('2026-01-01T00:00:00.000Z') },
    ]);
    return built;
  };

  const viewers = [{ viewerId: 'u-viewer', unreadCount: 1 }];

  it('répare LA conversation du lot, rejoue la fenêtre, et sert le pont du lecteur', async () => {
    const { prisma, db } = viewerPrisma(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({ conversationId: C0, viewers });

    expect(result.has('u-viewer')).toBe(true);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    expect(tombstoneOf(db, GHOST)).toBe(true);
    expect(tombstoneOf(db, GHOST_HORS_LOT)).toBe(false);
  });

  it('ne boucle pas : une fenêtre qui échoue encore après réparation ne sert aucun pont', async () => {
    const { prisma } = viewerPrisma(orphanedSenderPrismaError());
    prisma.message.findMany = jest.fn<any>().mockRejectedValue(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({ conversationId: C0, viewers });

    expect(result.size).toBe(0);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
  });
});
