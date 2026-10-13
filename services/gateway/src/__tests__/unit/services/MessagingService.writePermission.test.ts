/**
 * `MessagingService.handleMessage` — droit d'écriture du PARTICIPANT,
 * `canSendMessages` (#4855).
 *
 * FICHIER SÉPARÉ, délibérément — `MessagingService.test.ts` est une suite
 * héritée hors budget (§ `gateway-test-file-size-budget.test.ts`, #4531) :
 * lui ajouter un `describe` de plus la fait grandir alors que la règle 3 du
 * cliquet interdit tout gain sur les fichiers déjà hors budget. Un nouveau
 * comportement rejoint un fichier NEUF, à sa taille, plutôt que le tas.
 *
 * `participant.permissions` est l'instantané figé au join ;
 * `anonymousSession.rights` est la surcharge que l'hôte pose ensuite via
 * `PATCH …/participants/:id/rights`. Seul `routes/links/messages.ts`
 * appliquait ce droit avant #4855 — ni la route REST canonique
 * (`POST /conversations/:id/messages`) ni `message:send` (qui convergent
 * tous deux sur `handleMessage`) ne le lisaient : un hôte qui retirait le
 * droit d'écrire à un invité voyait le composeur des clients obéissants se
 * fermer (`participant:rights-updated`) pendant qu'un envoi direct passait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const mockHandleNewMessage = jest.fn();
const mockUpdateOnNewMessage = jest.fn();
const mockFindExistingTrackingLink = jest.fn();
const mockCreateTrackingLink = jest.fn();
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);
const mockExtractMentions = jest.fn();
const mockResolveUsernames = jest.fn();
const mockValidateMentionPermissions = jest.fn();
const mockCreateMentions = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockGetUnreadCount = jest.fn();

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({
    handleNewMessage: mockHandleNewMessage
  }))
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: mockUpdateOnNewMessage
  }
}));

const mockOnNewMessage: any = jest.fn(async () => undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockOnNewMessage(...a)
  }
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: mockFindExistingTrackingLink,
    createTrackingLink: mockCreateTrackingLink,
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

const mockExtractMentionsWithParticipants = jest.fn().mockReturnValue([]);
jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: mockExtractMentions,
    extractMentionsWithParticipants: mockExtractMentionsWithParticipants,
    resolveUsernames: mockResolveUsernames,
    validateMentionPermissions: mockValidateMentionPermissions,
    createMentions: mockCreateMentions
  }))
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    getUnreadCount: mockGetUnreadCount
  }))
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';
import { PARTICIPATION_VIVANTE } from '../../../routes/conversations/utils/access-control';

describe('MessagingService.handleMessage — droit d’écriture du PARTICIPANT — canSendMessages (#4855)', () => {
  let service: MessagingService;
  let mockPrisma: any;
  let mockTranslationService: any;
  let mockNotificationService: any;

  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testParticipantId = '507f1f77bcf86cd799439014';

  const createMockMessage = (overrides: Partial<Message> = {}): any => ({
    id: testMessageId,
    conversationId: testConversationId,
    senderId: testParticipantId,
    content: 'Test message content',
    originalLanguage: 'en',
    messageType: 'text',
    replyToId: null,
    deletedAt: null,
    isEdited: false,
    validatedMentions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  const validRequest: MessageRequest = {
    conversationId: testConversationId,
    content: 'Hello, this is a test message!'
  };

  const participantWithRights = (overrides: {
    permissions?: Record<string, boolean>;
    rights?: Record<string, boolean>;
  }) => ({
    id: testParticipantId,
    conversationId: testConversationId,
    isActive: true,
    type: 'anonymous',
    permissions: { canSendMessages: true, ...overrides.permissions },
    ...(overrides.rights ? { anonymousSession: { rights: overrides.rights } } : {})
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'en' })
    }) as any;

    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 10, participantCount: 2 });
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockCreateTrackingLink.mockResolvedValue({ token: 'abc123' });
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({
      isValid: true,
      validUserIds: [],
      invalidUsernames: [],
      errors: []
    });
    mockCreateMentions.mockResolvedValue(undefined);
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
    mockGetUnreadCount.mockResolvedValue(0);

    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: testConversationId, type: 'private' }),
        findFirst: jest.fn().mockResolvedValue({ id: testConversationId, identifier: 'test-conv', type: 'private' }),
        update: jest.fn().mockResolvedValue({ id: testConversationId, lastMessageAt: new Date() })
      },
      participant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      message: {
        create: jest.fn().mockResolvedValue({
          ...createMockMessage(),
          sender: {
            id: testParticipantId, displayName: 'Test User', avatar: null, role: 'member',
            isOnline: true, type: 'user', userId: undefined, language: 'en'
          },
          attachments: [],
          replyTo: null
        }),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }
    };

    mockTranslationService = { handleNewMessage: mockHandleNewMessage };
    mockNotificationService = {
      createMentionNotification: jest.fn().mockResolvedValue({ id: 'notif123' }),
      createMentionNotificationsBatch: jest.fn().mockResolvedValue(0)
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      mockTranslationService,
      mockNotificationService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuse un invité dont l’hôte a retiré canSendMessages APRÈS le join', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ rights: { canSendMessages: false } })
    );

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
    expect(response.error).toContain('autorisé');
    expect((response as unknown as { code?: string }).code).toBe('WRITE_NOT_PERMITTED');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse quand canSendMessages est fermé dès l’instantané, sans surcharge', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendMessages: false } })
    );

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('laisse écrire un invité dont l’instantané autorise, sans surcharge', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(participantWithRights({}));

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(true);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  // Non-régression : une garde qui lirait l'instantané BRUT plutôt que la loi
  // résolue (`resolveParticipantRights`) laisserait passer ce cas — exactement
  // le défaut de #4855.
  it('la surcharge FERMANTE de l’hôte prime sur un instantané ouvert', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(
      participantWithRights({ permissions: { canSendMessages: true }, rights: { canSendMessages: false } })
    );

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
  });

  // Un participant chargé SANS `permissions` (auto-création legacy, forme
  // héritée du cache) ne doit pas être refusé par une simple absence — seul un
  // refus EXPLICITE bloque, comme partout ailleurs dans ce module.
  it('n’est jamais refusé quand `permissions` est absent de la ligne chargée', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue({
      id: testParticipantId,
      conversationId: testConversationId,
      isActive: true
    });

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(true);
  });

  // #10440 — défense en profondeur (audit de #10437, #10436) : une ligne
  // active ET bannie — la forme que `restore-for-me` produisait avant #10436 —
  // n'écrit pas. La vérification de l'expéditeur lisait `isActive` seul.
  it('refuse une participation active mais BANNIE', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue({
      ...participantWithRights({}),
      bannedAt: new Date('2026-10-01T00:00:00Z'),
    });

    const response = await service.handleMessage(validRequest, testParticipantId);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Permissions insuffisantes');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('lit bannedAt sur la ligne chargée, et le repli par userId exige une participation vivante', async () => {
    mockPrisma.participant.findUnique.mockResolvedValue(null);
    mockPrisma.participant.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await service.handleMessage(validRequest, testParticipantId);

    expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ bannedAt: true }) })
    );
    expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PARTICIPATION_VIVANTE),
      })
    );
  });

  // #10443 — l'audit adversarial de #10440 : le pont legacy
  // `ensureParticipantFromMember` ne lisait aucune ligne `Participant`
  // existante. Le repli par userId exige une participation VIVANTE : un banni
  // n'y est pas trouvé, et un `ConversationMember` hérité encore actif lui
  // CRÉAIT une participation active neuve (seul l'index unique
  // `[conversationId, userId, sessionTokenHash]` l'empêchait, s'il est posé).
  it('ne crée jamais de participation depuis un ConversationMember hérité quand une ligne Participant existe déjà (banni)', async () => {
    const LEGACY_USER_ID = '507f1f77bcf86cd799439077';
    const rows: MongoDocument[] = [{
      id: 'p-banned', conversationId: testConversationId, userId: LEGACY_USER_ID, type: 'user',
      isActive: false, bannedAt: new Date('2026-10-01T00:00:00Z'),
    }];
    mockPrisma.participant.findUnique.mockResolvedValue(null);
    mockPrisma.participant.findFirst.mockImplementation(async ({ where }: { where: MongoDocument }) =>
      rows.find((row) => matchesMongoWhere(row, where)) ?? null
    );
    mockPrisma.user.findUnique.mockResolvedValue({
      id: LEGACY_USER_ID, username: 'legacy', displayName: 'Legacy', firstName: null, lastName: null, avatar: null, systemLanguage: 'fr'
    });
    mockPrisma.$runCommandRaw = jest.fn().mockResolvedValue({ cursor: { firstBatch: [{ role: 'MEMBER', isActive: true }] } });
    mockPrisma.participant.create = jest.fn();

    const response = await service.handleMessage(validRequest, LEGACY_USER_ID);

    expect(mockPrisma.participant.create).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});
