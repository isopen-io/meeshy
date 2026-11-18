/**
 * #18701 — le statut SERVI après un drain à émission PARTIELLE.
 *
 * #18614 a rétréci le GEL aux messages réellement livrés : un message refusé
 * par le drain, ou évincé par le plafond de 500 de la file, n'a plus d'entrée
 * `MessageStatusEntry`. Ce qui est GRAVÉ devient juste — et ce qui est SERVI
 * retombe alors sur le repli curseur, qui est POSITIF pour tout message
 * antérieur à l'heure du drain.
 *
 * Aucun témoin du dépôt ne descendait jusqu'au statut SERVI d'un message sans
 * entrée figée : c'est ce qui a laissé le défaut invisible, et c'est donc la
 * preuve que l'issue exige.
 *
 * Scénario mesuré, qui n'exige AUCUNE panne : conversation C, lecteur R absent.
 * M (10:00) est évincé par le `LTRIM` de `RedisDeliveryQueue` ; un message plus
 * récent part. Drain à 11:00 ⇒ curseur `lastDeliveredAt = 11:00`. L'auteur
 * voyait ✓✓ sur un message que personne n'a jamais reçu.
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

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const CUTOVER = '2026-09-22T00:00:00.000Z';

/** Le message n'a PAS d'entrée figée — le drain a refusé de l'émettre. */
const arrangeDrainedWithoutEmission = (messageCreatedAt: Date) => {
  mockPrisma.message.findFirst.mockResolvedValue({
    id: MESSAGE_ID,
    createdAt: messageCreatedAt,
    senderId: 'sender-participant',
  });
  mockPrisma.message.findUnique.mockResolvedValue({
    createdAt: messageCreatedAt,
    conversationId: CONVERSATION_ID,
    senderId: 'sender-participant',
  });
  // `userId: null` : aucun opt-out à charger, donc aucune porte de préférences
  // dans ce harnais — le lot ne porte pas sur elles.
  mockPrisma.participant.findMany.mockResolvedValue([
    { id: 'reader', userId: null, displayName: 'R', avatar: null, user: null },
  ]);
  mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
    {
      participantId: 'reader',
      // L'HORLOGE MURALE du drain, une heure APRÈS la création du message.
      lastDeliveredAt: new Date(messageCreatedAt.getTime() + 3_600_000),
      lastReadAt: null,
    },
  ]);
  mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
  mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
  mockPrisma.messageAttachment.findMany.mockResolvedValue([]);
  mockPrisma.message.findMany.mockResolvedValue([
    { id: MESSAGE_ID, createdAt: messageCreatedAt, senderId: 'sender-participant' },
  ]);
};

describe('Le statut SERVI ne retombe plus sur une horloge murale (#18701)', () => {
  const previousCutover = process.env.EXACT_READ_TRACKING_SINCE;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    process.env.EXACT_READ_TRACKING_SINCE = CUTOVER;
  });

  afterAll(() => {
    if (previousCutover === undefined) delete process.env.EXACT_READ_TRACKING_SINCE;
    else process.env.EXACT_READ_TRACKING_SINCE = previousCutover;
  });

  it('getLatestMessageSummary ne compte pas remis un message que le drain a refusé', async () => {
    arrangeDrainedWithoutEmission(new Date('2026-10-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const summary = await service.getLatestMessageSummary(CONVERSATION_ID);

    expect(summary.deliveredCount).toBe(0);
    expect(summary.totalMembers).toBe(1);
  });

  it('getLatestMessageSummary garde le repli pour un message ANTÉRIEUR à la bascule', async () => {
    arrangeDrainedWithoutEmission(new Date('2026-09-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const summary = await service.getLatestMessageSummary(CONVERSATION_ID);

    expect(summary.deliveredCount).toBe(1);
  });

  it('getLatestMessageSummary, bascule NON armée : comportement historique à l\'identique', async () => {
    delete process.env.EXACT_READ_TRACKING_SINCE;
    arrangeDrainedWithoutEmission(new Date('2026-10-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const summary = await service.getLatestMessageSummary(CONVERSATION_ID);

    expect(summary.deliveredCount).toBe(1);
  });

  it('getMessageReadStatus ne nomme pas le lecteur dans « Reçu par »', async () => {
    arrangeDrainedWithoutEmission(new Date('2026-10-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const status = await service.getMessageReadStatus(MESSAGE_ID, CONVERSATION_ID, null);

    expect(status.receivedBy).toEqual([]);
  });

  it('getConversationReadStatuses ne compte pas remis le message refusé', async () => {
    arrangeDrainedWithoutEmission(new Date('2026-10-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const statuses = await service.getConversationReadStatuses(CONVERSATION_ID, [MESSAGE_ID]);

    expect(statuses.get(MESSAGE_ID)?.receivedCount).toBe(0);
    expect(statuses.get(MESSAGE_ID)?.deliveredToAllAt).toBeNull();
  });

  it('getMessageStatusDetails sert `deliveredAt: null`, et le filtre « delivered » l\'exclut', async () => {
    arrangeDrainedWithoutEmission(new Date('2026-10-01T10:00:00.000Z'));
    const service = new MessageReadStatusService(mockPrisma as any);

    const all = await service.getMessageStatusDetails(MESSAGE_ID, null);
    const delivered = await service.getMessageStatusDetails(MESSAGE_ID, null, { filter: 'delivered' });

    expect(all.statuses).toHaveLength(1);
    expect(all.statuses[0].deliveredAt).toBeNull();
    expect(all.statuses[0].receivedAt).toBeNull();
    expect(delivered.statuses).toEqual([]);
  });
});
