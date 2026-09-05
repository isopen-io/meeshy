/**
 * Témoins du service de CONSOMMATION MÉDIA (#4605, lot 2).
 *
 * Déplacés tels quels de `MessageReadStatusService.test.ts` (5773 lignes,
 * plafond 1000), dont ils formaient un bloc CONTIGU de 509 lignes. Le découpage
 * suit celui de la SOURCE : `MessageMediaConsumptionService` a été extrait de
 * `MessageReadStatusService` le 2026-08-31 (`de4c5fe882`) ; ses témoins le
 * suivent.
 *
 * Les tests appellent le service par sa FAÇADE (`MessageReadStatusService`), qui
 * délègue — c'est ce qui rend le déplacement mécanique, et ce qui prouve au
 * passage que la délégation tient.
 *
 * L'échafaudage (`mockPrisma`, `beforeEach`) est DUPLIQUÉ plutôt que partagé :
 * `jest.mock('@meeshy/shared/prisma/client')` capture `mockPrisma` dans sa
 * fermeture, et le hissage exige qu'il vive dans le module qui l'écrit. Deux
 * services, deux doubles de base — le partager se paierait en indirection sans
 * retirer la contrainte.
 *
 * @jest-environment node
 */

import { MessageReadStatusService, buildCursorFreshnessGuard } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// Mock the NotificationService import (used dynamically in markMessagesAsRead)
jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

// Mock Prisma client with new models
const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn()
  },
  messageStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn()
  },
  attachmentStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },
  message: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  userPreference: {
    findMany: jest.fn()
  },
  userPreferences: {
    findMany: jest.fn()
  },
  messageAttachment: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  participant: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  // Mock $transaction to pass the mock prisma to the callback
  $transaction: jest.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    // Create a transaction mock that proxies to the main mock (includes findMany)
    return callback(mockPrisma);
  })
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('MessageReadStatusService', () => {
  let service: MessageReadStatusService;

  // Test data
  const testParticipantId = '507f1f77bcf86cd799439011';
  const testParticipantId2 = '507f1f77bcf86cd799439015';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testMessageId2 = '507f1f77bcf86cd799439014';
  const testAttachmentId = '507f1f77bcf86cd799439016';

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear the static dedup cache to ensure tests are isolated
    (MessageReadStatusService as any).recentActionCache.clear();
    // Idem pour le cache d'opt-out « accusés de lecture » : sa portée est le
    // processus, une entrée laissée par un test fausserait le suivant.
    clearPrivacyPreferencesCache();

    // `clearAllMocks` efface les APPELS, pas les implémentations : un
    // `mockRejectedValue` posé par un test survit à tous les suivants. Sans
    // conséquence tant que seul `getAttachmentStatus` lisait cette entrée ;
    // depuis que les marquages relisent la trace avant de l'étendre, la fuite
    // fait échouer des tests sans rapport. Remise à l'état « aucune entrée
    // antérieure », qui est le cas nominal d'un premier rapport.
    mockPrisma.attachmentStatusEntry.findUnique.mockReset();
    mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);

    // Suppress console output in tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Safe default for the cursor-advance guard (_advanceCursor): the row
    // already exists and the write is fresh, so the guarded updateMany
    // succeeds — matching the old unconditional-upsert behavior for every
    // test that isn't specifically exercising the create or stale paths.
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });

    // Safe defaults for the per-message freeze path (freezeMessageStatus).
    // Individual tests override these to exercise the freeze behavior.
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    // Default: no per-participant media consumption rows (getMessageReadStatus).
    // Individual tests override this to exercise the attachmentConsumption path.
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    // Default: personne n'a désactivé ses accusés de lecture — ni dans le
    // document JSON qu'écrit l'application, ni dans les lignes clé/valeur
    // héritées. Les DEUX rangements doivent être modélisés : un double qui
    // n'en connaît qu'un ne peut pas voir lequel des deux la porte consulte.
    mockPrisma.userPreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);

    // Create service instance with mock Prisma
    service = new MessageReadStatusService(mockPrisma as any);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  // ==============================================
  // INITIALIZATION TESTS
  // ==============================================

  // ==============================================
  // AUDIO STATUS TESTS
  // ==============================================

  describe('markAudioAsListened', () => {
    it('should create/update attachment status for audio', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      // Mock for updateAttachmentComputedStatus
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 10000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          attachmentId: testAttachmentId,
          messageId: testMessageId,
          participantId: testParticipantId,
          listenedAt: expect.any(Date),
          listenCount: 1,
          lastPlayPositionMs: 5000,
          totalListenDurationMs: 10000,
          listenedComplete: false
        }),
        update: expect.objectContaining({
          listenedAt: expect.any(Date),
          listenCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAudioAsListened(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });

    it('should track listen completion', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, { complete: true });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ listenedComplete: true }),
          update: expect.objectContaining({ listenedComplete: true })
        })
      );
    });
  });

  // ==============================================
  // TRACE DE L'INTERACTION ET PRISME LINGUISTIQUE
  // ==============================================

  describe('Trace de l\'interaction média', () => {
    const anAudioAttachment = () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});
    };

    const lastUpsert = () =>
      mockPrisma.attachmentStatusEntry.upsert.mock.calls.at(-1)?.[0] as any;

    it('persiste la trace du premier rapport', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().create.listenSegments).toEqual([
        { startMs: 0, endMs: 500, endedBy: 'pause' }
      ]);
    });

    it('ajoute à la suite de la trace déjà connue, sans la trier', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: [{ startMs: 9000, endMs: 9500, endedBy: 'seek' }],
        viewedLanguages: []
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 400, endedBy: 'pause' }]
      });

      expect(lastUpsert().update.listenSegments).toEqual([
        { startMs: 9000, endMs: 9500, endedBy: 'seek' },
        { startMs: 0, endMs: 400, endedBy: 'pause' }
      ]);
    });

    it('ne recompte pas une écoute re-postée par la file hors-ligne', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: [{ startMs: 0, endMs: 500, endedBy: 'pause' }],
        viewedLanguages: []
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().update.listenSegments).toHaveLength(1);
    });

    it('écarte une écoute malformée sans perdre les valides', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [
          { startMs: 500, endMs: 100, endedBy: 'pause' },
          { startMs: 0, endMs: 300, endedBy: 'pause' }
        ]
      });

      expect(lastUpsert().create.listenSegments).toEqual([
        { startMs: 0, endMs: 300, endedBy: 'pause' }
      ]);
    });

    it('sépare la trace vidéo de la trace audio', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 800, endedBy: 'completed' }]
      });

      expect(lastUpsert().create.watchSegments).toEqual([
        { startMs: 0, endMs: 800, endedBy: 'completed' }
      ]);
      expect(lastUpsert().create.listenSegments).toBeUndefined();
    });

    it('compte les ouvertures d\'une image', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/png',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId, {});

      expect(lastUpsert().create.viewCount).toBe(1);
      expect(lastUpsert().update.viewCount).toEqual({ increment: 1 });
    });
  });

  describe('recordMessageLanguageView — bascule sur une bulle', () => {
    it('ajoute la langue à l\'entrée du message', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({
        id: 'entry1',
        viewedLanguages: ['fr']
      });

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en');

      expect(mockPrisma.messageStatusEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry1' },
        data: { viewedLanguages: { push: 'en' } }
      });
    });

    it('ne recrée pas une entrée absente — un choix de langue n\'est pas une lecture', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue(null);

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en');

      expect(mockPrisma.messageStatusEntry.update).not.toHaveBeenCalled();
    });

    it('n\'écrit pas une langue déjà présente', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({
        id: 'entry1',
        viewedLanguages: ['fr', 'en']
      });

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en-GB');

      expect(mockPrisma.messageStatusEntry.update).not.toHaveBeenCalled();
    });

    it('ignore une langue illisible sans interroger la base', async () => {
      await service.recordMessageLanguageView(testParticipantId, testMessageId, '@@@');

      expect(mockPrisma.messageStatusEntry.findFirst).not.toHaveBeenCalled();
    });

    it('ne fait pas échouer la requête si la base tombe', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockRejectedValue(new Error('DB down'));

      await expect(
        service.recordMessageLanguageView(testParticipantId, testMessageId, 'en')
      ).resolves.toBeUndefined();
    });
  });

  describe('Prisme linguistique — attachements', () => {
    const anAudioAttachment = () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});
    };

    const lastUpsert = () =>
      mockPrisma.attachmentStatusEntry.upsert.mock.calls.at(-1)?.[0] as any;

    it('retient la langue de la piste écoutée', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'fr'
      });

      expect(lastUpsert().create.viewedLanguages).toEqual(['fr']);
    });

    it('accumule les bascules plutôt que de garder la dernière', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: null,
        viewedLanguages: ['fr']
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'en'
      });

      expect(lastUpsert().update.viewedLanguages).toEqual(['fr', 'en']);
    });

    it('normalise la locale complète envoyée par iOS', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'fr_FR'
      });

      expect(lastUpsert().create.viewedLanguages).toEqual(['fr']);
    });

    it('ignore une langue illisible sans perdre le reste du rapport', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: '@@@',
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().create.viewedLanguages).toEqual([]);
      expect(lastUpsert().create.listenSegments).toHaveLength(1);
    });
  });

  // ==============================================
  // VIDEO STATUS TESTS
  // ==============================================

  describe('markVideoAsWatched', () => {
    it('should create/update attachment status for video', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId, {
        watchPositionMs: 30000,
        watchDurationMs: 60000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: 1,
          lastWatchPositionMs: 30000,
          totalWatchDurationMs: 60000,
          watchedComplete: true
        }),
        update: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markVideoAsWatched(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // IMAGE STATUS TESTS
  // ==============================================

  describe('markImageAsViewed', () => {
    it('should create/update attachment status for image', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/jpeg',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId, {
        viewDurationMs: 5000,
        wasZoomed: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        }),
        update: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markImageAsViewed(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // DOWNLOAD STATUS TESTS
  // ==============================================

  describe('markAttachmentAsDownloaded', () => {
    it('should create/update download status', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          downloadedAt: expect.any(Date)
        }),
        update: expect.objectContaining({
          downloadedAt: expect.any(Date)
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAttachmentAsDownloaded(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // GET ATTACHMENT STATUS TESTS
  // ==============================================

  describe('getAttachmentStatus', () => {
    it('should return full attachment status', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        viewedAt: new Date(),
        downloadedAt: new Date(),
        listenedAt: new Date(),
        watchedAt: null,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toEqual({
        viewed: true,
        downloaded: true,
        listened: true,
        watched: false,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });
    });

    it('should return null when no status exists', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
      // Le service utilise maintenant enhancedLogger au lieu de console.error
    });
  });
});
