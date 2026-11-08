/**
 * #16744 — la frontière de RATTRAPAGE (`caughtUpToMessageId`) gouverne les DEUX
 * modes de `markMessagesAsRead`, pas seulement le mode exact.
 *
 * Suite SÉPARÉE, et pas un ajout à `MessageReadStatusService.test.ts` : ce
 * fichier est hors budget (dette héritée gelée par
 * `gateway-test-file-size-budget.test.ts`), et la règle du dépôt est « ajouter à
 * un fichier déjà hors budget est interdit : on extrait d'abord, on ajoute
 * ensuite ». Le cliquet l'a dit, et il avait raison.
 *
 * Ce que ces témoins gardent — le contrat de `MarkReadBodySchema`
 * (`validation/messages-schemas.ts:197-209`) : « Fait avancer le curseur de
 * non-lus jusque-là — donc vide le badge — SANS ÉLARGIR D'UN SEUL MESSAGE
 * l'ensemble déclaré LU. […] Les confondre gonflerait les coches bleues. »
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn(),
    update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn()
  },
  messageStatusEntry: {
    findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(),
    update: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn()
  },
  attachmentStatusEntry: {
    findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), count: jest.fn()
  },
  message: {
    count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn()
  },
  userPreference: { findMany: jest.fn() },
  userPreferences: { findMany: jest.fn() },
  messageAttachment: { findUnique: jest.fn(), update: jest.fn() },
  participant: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma))
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

describe('MessageReadStatusService — la frontière de rattrapage', () => {
  let service: MessageReadStatusService;

  const testParticipantId = '507f1f77bcf86cd799439011';
  const testConversationId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    clearPrivacyPreferencesCache();
    mockPrisma.attachmentStatusEntry.findUnique.mockReset();
    mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.userPreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);

    service = new MessageReadStatusService(mockPrisma as any);
  });

  describe('markMessagesAsRead', () => {
    // #16744 — LA FORME QUE LE WEB ENVOIE. `pushReadReceipt`
    // (`apps/web/src/lib/api/receipts.ts:35-44`) poste
    // `{ type: 'read', caughtUpToMessageId }` SANS `messageIds` — c'est son
    // chemin de lecture nominal (ouverture du fil, défilement, retour au
    // premier plan). `exactMessageIds` était donc `undefined`, la branche
    // HÉRITÉE prenait la main, et elle ne lit pas `caughtUpToMessageId` du
    // tout : le curseur sautait au DERNIER message EN BASE.
    it('rattrapage sans lot affiché : le curseur se pose sur la frontière RAPPORTÉE, pas sur le dernier message en base', async () => {
      const msgFrontier = '507f1f77bcf86cd799439100';
      const msgArrivedSince = '507f1f77bcf86cd799439130';
      // Ce que la base a de plus récent — trente messages sont arrivés depuis
      // que le lecteur a calculé sa frontière (accusé rejoué depuis la file
      // hors ligne du web, dix minutes plus tard).
      mockPrisma.message.findFirst.mockResolvedValue({
        id: msgArrivedSince,
        createdAt: new Date('2025-01-03T00:00:00Z')
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        conversationId: testConversationId,
        createdAt: new Date('2025-01-02T00:00:00Z')
      });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        caughtUpToMessageId: msgFrontier
      });

      const cursorWrites = mockPrisma.conversationReadCursor.updateMany.mock.calls
        .map((c: any[]) => c[0].data)
        .filter((d: any) => d.lastReadMessageId !== undefined);
      expect(cursorWrites).toContainEqual(
        expect.objectContaining({ lastReadMessageId: msgFrontier, unreadCount: 0 })
      );
      // Le dommage : `lastReadMessageCreatedAt` planche le compteur de non-lus
      // (`unreadCountOfParticipant.ts`). Posé sur `msgArrivedSince`, les trente
      // messages du milieu ne sont plus JAMAIS comptés.
      expect(cursorWrites).not.toContainEqual(
        expect.objectContaining({ lastReadMessageId: msgArrivedSince })
      );
    });

    // Le gel est write-once (`freezeMessageStatus`) : un message gravé « lu »
    // à tort l'est pour toujours, et l'expéditeur voit la coche bleue.
    it('rattrapage sans lot affiché : le gel est borné sur la POSITION de la frontière, pas sur l\'horloge murale', async () => {
      const msgFrontier = '507f1f77bcf86cd799439100';
      const frontierAt = new Date('2025-01-02T00:00:00Z');
      const prevReadAt = new Date('2024-12-01T00:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        id: '507f1f77bcf86cd799439130',
        createdAt: new Date('2025-01-03T00:00:00Z')
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        conversationId: testConversationId,
        createdAt: frontierAt
      });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: prevReadAt });
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        caughtUpToMessageId: msgFrontier
      });

      // Le gel de LECTURE se reconnaît à sa borne basse : il part de
      // `prevReadAt`. Le gel « lu implique livré » qui le suit porte
      // `since: prevDeliveredAt`, nul ici, donc aucun `gt` — et il garde
      // légitimement l'horloge murale (un message reçu l'est vraiment).
      const readFreezeWindows = mockPrisma.message.findMany.mock.calls
        .map((c: any[]) => c[0]?.where)
        .filter((w: any) => w && w.senderId && w.createdAt?.gt);
      expect(readFreezeWindows).not.toEqual([]);
      for (const where of readFreezeWindows) {
        expect(where.createdAt).toEqual({ lte: frontierAt, gt: prevReadAt });
      }
    });

    // Fail-closed : une frontière étrangère ne gouverne rien ET ne fait pas
    // retomber la lecture sur la forme héritée, dont le curseur saute au
    // dernier message en base — c'est-à-dire exactement le dommage.
    it("rattrapage sans lot affiché : une frontière d'une AUTRE conversation n'acquitte RIEN", async () => {
      const msgForeign = '507f1f77bcf86cd799439098';
      const msgNewest = '507f1f77bcf86cd799439130';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgNewest, createdAt: new Date('2025-01-03T00:00:00Z') });
      mockPrisma.message.findUnique.mockResolvedValue({
        conversationId: '507f1f77bcf86cd799439055',
        createdAt: new Date('2025-01-02T00:00:00Z')
      });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      const marked = await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        caughtUpToMessageId: msgForeign
      });

      expect(marked).toBe(0);
      const cursorWrites = mockPrisma.conversationReadCursor.updateMany.mock.calls
        .map((c: any[]) => c[0].data)
        .filter((d: any) => d.lastReadMessageId !== undefined);
      expect(cursorWrites).toEqual([]);
    });

    // NON-RÉGRESSION — « marquer la conversation comme lue » (`pushRead`,
    // corps `{ type: 'read' }` nu) n'a PAS de frontière : sa fenêtre monte
    // jusqu'à l'horloge murale et son curseur saute au dernier message en
    // base. C'est la forme héritée, et elle doit rester intacte.
    it('marquer comme lu sans frontière : la forme héritée est intacte', async () => {
      const msgNewest = '507f1f77bcf86cd799439130';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgNewest, createdAt: new Date('2025-01-03T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId);

      const cursorWrites = mockPrisma.conversationReadCursor.updateMany.mock.calls
        .map((c: any[]) => c[0].data)
        .filter((d: any) => d.lastReadMessageId !== undefined);
      expect(cursorWrites).toContainEqual(
        expect.objectContaining({ lastReadMessageId: msgNewest, unreadCount: 0 })
      );
      // Aucune borne de position : la frontière n'existe pas sur ce chemin.
      const freezeWindows = mockPrisma.message.findMany.mock.calls
        .map((c: any[]) => c[0]?.where)
        .filter((w: any) => w && w.senderId && w.createdAt?.gt);
      expect(freezeWindows).not.toEqual([]);
      for (const where of freezeWindows) {
        expect(where.createdAt.lte).toBeInstanceOf(Date);
        expect(where.createdAt.lte.getTime()).toBeGreaterThan(new Date('2025-01-03T00:00:00Z').getTime());
      }
    });
  });
});
