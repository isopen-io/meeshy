/**
 * La PROJECTION de la loi du plancher de livraison, aux deux sites qui la
 * chargent (#19261, consolidé).
 *
 * Pourquoi un témoin de REQUÊTE et pas un de verdict : le `select` est la seule
 * des deux conditions d'une descente qu'un témoin de verdict ne peut pas voir.
 * Un double Prisma rend ce qu'on lui dit quel que soit son `select`, si bien que
 * les six témoins de comportement de #19261 resteraient VERTS sur une
 * production aveugle — et c'est exactement ce qui était arrivé à la cascade
 * « lu ⇒ remis », dont le `select` ignorait la colonne pendant que la règle
 * était écrite deux fois plus haut (leçon 276).
 *
 * Le compilateur tient l'autre moitié : `DeliveryFloorCursor` EXIGE les deux
 * colonnes, donc réduire la projection d'un site rend `TS2345`. Ces témoins
 * gardent ce que le compilateur ne voit pas — que les sites demandent bien la
 * colonne à la BASE.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  messageStatusEntry: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
  attachmentStatusEntry: { findMany: jest.fn() },
  messageAttachment: { findMany: jest.fn() },
  message: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  participant: { findMany: jest.fn(), findUnique: jest.fn() },
  userPreference: { findMany: jest.fn() },
  userPreferences: { findMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const READER = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439012';
const M3 = '507f1f77bcf86cd79943901c';
const M3_AT = new Date('2026-10-01T10:10:00.000Z');

/** Les `select` que le service a réellement demandés sur le curseur. */
const cursorSelects = (): readonly any[] =>
  mockPrisma.conversationReadCursor.findUnique.mock.calls
    .map(([args]: [any]) => args?.select)
    .filter((select: any) => select != null);

describe('Les deux sites de plage chargent la projection de la loi (#19261)', () => {
  const previousCutover = process.env.EXACT_READ_TRACKING_SINCE;

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    clearPrivacyPreferencesCache();
    delete process.env.EXACT_READ_TRACKING_SINCE;
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversationReadCursor.create.mockResolvedValue({});
    mockPrisma.message.findFirst.mockResolvedValue({ id: M3, createdAt: M3_AT });
    mockPrisma.message.findUnique.mockResolvedValue({
      createdAt: M3_AT,
      conversationId: CONVERSATION,
    });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockPrisma.participant.findUnique.mockResolvedValue(null);
  });

  afterAll(() => {
    if (previousCutover === undefined) delete process.env.EXACT_READ_TRACKING_SINCE;
    else process.env.EXACT_READ_TRACKING_SINCE = previousCutover;
  });

  it('markMessagesAsReceived demande la POSITION de livraison à la base', async () => {
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M3);

    expect(cursorSelects()).toContainEqual(
      expect.objectContaining({ lastDeliveredMessageCreatedAt: true })
    );
  });

  it('markMessagesAsRead la demande aussi — le site qui ne la chargeait pas', async () => {
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M3);

    expect(cursorSelects()).toContainEqual(
      expect.objectContaining({ lastDeliveredMessageCreatedAt: true })
    );
  });
});
