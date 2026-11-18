/**
 * Bascule du suivi exact (`EXACT_READ_TRACKING_SINCE`) — ce qu'un message
 * DÉPOURVU d'entrée figée vaut, une fois la bascule armée.
 *
 * Les suites voisines n'exercent JAMAIS ce chemin : la bascule est désarmée par
 * défaut, donc tout y passe par le repli curseur. Sans ce bloc dédié, un câblage
 * incorrect reste invisible.
 *
 * Extrait de `MessageReadStatusService.test.ts` (#18701), qui porte la dette de
 * budget de taille (#4531, `DETTE_HERITEE` = 5264 lignes) : la règle est
 * d'extraire avant d'ajouter, jamais de grossir un fichier déjà hors budget —
 * même précédent que `MessageReadStatusService.latestSummaryNamesMessage.test.ts`.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const mockPrisma: any = {
  message: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  participant: { findMany: jest.fn() },
  conversationReadCursor: { findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn() },
  attachmentStatusEntry: { findMany: jest.fn() },
  messageAttachment: { findMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('MessageReadStatusService — bascule du suivi exact', () => {
  let service: MessageReadStatusService;

  const testParticipantId = '507f1f77bcf86cd799439011';
  const testParticipantId2 = '507f1f77bcf86cd799439015';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    clearPrivacyPreferencesCache();
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageAttachment.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    service = new MessageReadStatusService(mockPrisma as any);
  });

// ───────────────────────────────────────────────────────────────────────────
// Bascule EXACT_READ_TRACKING_SINCE
//
// Armée, un message dépourvu de `readAt` figé cesse d'être déclaré lu au seul
// motif que le curseur l'a dépassé. Les tests voisins n'exercent JAMAIS ce
// chemin — la bascule étant désarmée par défaut — d'où ce bloc dédié : sans
// lui, un câblage incorrect passerait inaperçu.
//
// `deliveredAt` conservait son repli curseur — « un message récupéré est
// livré ». La prémisse est tombée avec #18614 : le drain ne grave plus
// d'entrée pour un message qu'il a REFUSÉ d'émettre (émission qui lève,
// plafond de 500 de la file), et `ConversationReadCursor.lastDeliveredAt`
// est une horloge MURALE qui ne recule jamais. Le repli répondait donc
// « remis » pour exactement les messages que le gel venait, à raison, de
// laisser de côté. Passé la bascule, la livraison suit la même discipline
// que la lecture : l'absence de gel VEUT DIRE l'absence de livraison (#18701).
// @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
// @see services/gateway/decisions/2026-11-15-le-statut-servi-de-la-livraison-suit-la-bascule-18701.md
// ───────────────────────────────────────────────────────────────────────────
describe('bascule du suivi exact (EXACT_READ_TRACKING_SINCE)', () => {
  const ENV_KEY = 'EXACT_READ_TRACKING_SINCE';
  const originalEnv = process.env[ENV_KEY];

  // Tous les messages des montages ci-dessous sont postérieurs à cette date,
  // donc soumis au suivi exact une fois la bascule armée.
  const armCutover = () => { process.env[ENV_KEY] = '2024-01-01T00:00:00.000Z'; };

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it('getMessageReadStatus: a cursor-only read no longer counts', async () => {
    armCutover();
    mockPrisma.message.findUnique.mockResolvedValue({
      id: testMessageId,
      createdAt: new Date('2025-01-01T10:00:00Z'),
      senderId: testParticipantId,
      anonymousSenderId: null,
      conversationId: testConversationId
    });
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: testParticipantId, displayName: 'User1' },
      { id: testParticipantId2, displayName: 'User2' }
    ]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: testParticipantId2,
      lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
      lastReadAt: new Date('2025-01-01T10:10:00Z'),
      participant: { id: testParticipantId2, displayName: 'User2' }
    }]);

    const result = await service.getMessageReadStatus(testMessageId, testConversationId, null);

    expect(result.readCount).toBe(0);
    expect(result.readBy).toHaveLength(0);
    // #18701 — la livraison suit la même discipline : sans entrée figée,
    // le curseur n'affirme plus rien d'un message postérieur à la bascule.
    expect(result.receivedCount).toBe(0);
  });

  it('getConversationReadStatuses: a cursor-only read no longer counts', async () => {
    armCutover();
    mockPrisma.message.findMany.mockResolvedValue([
      { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-1' }
    ]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: testParticipantId,
      lastDeliveredAt: new Date('2025-01-01T12:00:00Z'),
      lastReadAt: new Date('2025-01-01T12:00:00Z')
    }]);

    const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

    expect(result.get(testMessageId)).toEqual(
      expect.objectContaining({ receivedCount: 0, readCount: 0 })
    );
  });

  it('getMessageStatusDetails: readAt ET deliveredAt retombent à null (#18701)', async () => {
    armCutover();
    mockPrisma.message.findUnique.mockResolvedValue({
      createdAt: new Date('2024-06-01T10:00:00Z'),
      conversationId: testConversationId
    });
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: 'p1',
      lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
      lastReadAt: new Date('2024-06-01T10:02:00Z')
    }]);
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: 'p1', displayName: 'Alice', avatar: null }
    ]);

    const result = await service.getMessageStatusDetails(testMessageId, null);

    expect(result.statuses[0].readAt).toBeNull();
    // `deliveredAt` est SERVI tel quel et gouverne le filtre « delivered » :
    // il porte le même repli que `receivedAt`, donc la même borne.
    expect(result.statuses[0].deliveredAt).toBeNull();
  });

  it('getLatestMessageSummary: a cursor-only read no longer counts', async () => {
    armCutover();
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date('2024-06-01T10:00:00Z'),
      senderId: 'sender-id'
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
      { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
    ]);

    const result = await service.getLatestMessageSummary(testConversationId);

    expect(result.readCount).toBe(0);
    expect(result.deliveredCount).toBe(0);
  });

  it('a message PREDATING the cutover keeps the legacy cursor fallback', async () => {
    armCutover();
    // Créé avant la bascule : il n'a jamais eu l'occasion d'être gelé, le
    // priver du repli le ferait basculer à tort en « jamais vu ».
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date('2023-06-01T10:00:00Z'),
      senderId: 'sender-id'
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: 'p1', lastDeliveredAt: new Date('2023-06-01T10:01:00Z'), lastReadAt: new Date('2023-06-01T10:02:00Z') }
    ]);

    const result = await service.getLatestMessageSummary(testConversationId);

    expect(result.readCount).toBe(1);
    // Le repli de LIVRAISON est consenti au même titre, et pour la même
    // raison : ce message n'a jamais eu l'occasion d'être gelé.
    expect(result.deliveredCount).toBe(1);
  });
});
});
