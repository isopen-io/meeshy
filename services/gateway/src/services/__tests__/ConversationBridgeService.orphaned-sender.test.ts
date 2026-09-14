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
 * La réparation a son témoin exhaustif
 * (`__tests__/unit/services/messaging/repairOrphanedMessageSenders.test.ts`) ;
 * ce fichier garde la FRONTIÈRE : quelle portée, combien de rejeux.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../messaging/repairOrphanedMessageSenders', () => ({
  repairOrphanedMessageSenders: jest.fn<any>(),
}));

import { ConversationBridgeService } from '../ConversationBridgeService';
import { repairOrphanedMessageSenders } from '../messaging/repairOrphanedMessageSenders';
import { orphanedSenderPrismaError } from '../../__tests__/helpers/orphaned-sender-db';

const repair = repairOrphanedMessageSenders as unknown as jest.Mock<any>;
const NOTHING_REPAIRED = { deletedNotices: 0, tombstoned: 0, reassignedMessages: 0, failures: 0 };

const at = (iso: string) => new Date(iso);

const windowRow = (conversationId: string, id: string) => ({
  id,
  conversationId,
  senderId: `other-${conversationId}`,
  createdAt: at('2026-03-01T10:00:00.000Z'),
  messageType: 'text',
  sender: { displayName: 'Compte supprimé', nickname: null, user: null },
  attachments: [],
});

/**
 * Deux conversations non lues ; la fenêtre de messages rejette d'abord avec
 * `firstRead`, puis sert ses lignes.
 */
const makePrisma = (firstRead: Error) => {
  const rows = [windowRow('c0', 'm0'), windowRow('c1', 'm1')];
  return {
    participant: {
      findMany: jest.fn(async () => [
        { id: 'p0', userId: 'u-viewer', conversationId: 'c0', joinedAt: at('2026-01-01T00:00:00.000Z'), isActive: true },
        { id: 'p1', userId: 'u-viewer', conversationId: 'c1', joinedAt: at('2026-01-01T00:00:00.000Z'), isActive: true },
      ]),
    },
    conversationReadCursor: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    message: {
      findMany: jest.fn<any>().mockRejectedValueOnce(firstRead).mockResolvedValue(rows),
      count: jest.fn(async () => 0),
    },
  } as any;
};

const candidates = [
  { conversationId: 'c0', unreadCount: 1 },
  { conversationId: 'c1', unreadCount: 1 },
];

describe('#6501 — buildBridgeData et un expéditeur disparu', () => {
  it('répare les conversations de la passe, rejoue la fenêtre, et sert le pont', async () => {
    repair.mockReset().mockResolvedValue({ ...NOTHING_REPAIRED, tombstoned: 1 });
    const prisma = makePrisma(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeData({ viewerId: 'u-viewer', candidates });

    expect(result.size).toBe(2);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledWith(prisma, { conversationIds: ['c0', 'c1'] });
  });

  it("une erreur ÉTRANGÈRE garde la posture d'échec — aucune réparation, aucun pont", async () => {
    repair.mockReset();
    const prisma = makePrisma(new Error('connection reset'));

    const result = await new ConversationBridgeService(prisma).buildBridgeData({ viewerId: 'u-viewer', candidates });

    expect(result.size).toBe(0);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    expect(repair).not.toHaveBeenCalled();
  });
});

describe('#6501 — buildBridgeDataForViewers et un expéditeur disparu', () => {
  const viewerPrisma = (firstRead: Error) => {
    const prisma = makePrisma(firstRead);
    prisma.participant.findMany = jest.fn(async () => [
      { id: 'p0', userId: 'u-viewer', joinedAt: at('2026-01-01T00:00:00.000Z') },
    ]);
    return prisma;
  };

  it('répare LA conversation du lot, rejoue la fenêtre, et sert le pont du lecteur', async () => {
    repair.mockReset().mockResolvedValue({ ...NOTHING_REPAIRED, tombstoned: 1 });
    const prisma = viewerPrisma(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: 'c0',
      viewers: [{ viewerId: 'u-viewer', unreadCount: 1 }],
    });

    expect(result.has('u-viewer')).toBe(true);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledWith(prisma, { conversationIds: ['c0'] });
  });

  it('ne boucle pas : une fenêtre qui échoue encore après réparation ne sert aucun pont', async () => {
    repair.mockReset().mockResolvedValue(NOTHING_REPAIRED);
    const prisma = viewerPrisma(orphanedSenderPrismaError());
    prisma.message.findMany = jest.fn<any>().mockRejectedValue(orphanedSenderPrismaError());

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: 'c0',
      viewers: [{ viewerId: 'u-viewer', unreadCount: 1 }],
    });

    expect(result.size).toBe(0);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
  });
});
