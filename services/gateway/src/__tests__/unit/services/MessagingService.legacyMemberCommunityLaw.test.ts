/**
 * `MessagingService.handleMessage` — le pont `ConversationMember` hérité
 * suit la loi des salons d'une communauté privée (#16724).
 *
 * Quand aucune ligne `Participant` n'existe, `ensureParticipantFromMember`
 * créait une participation ACTIVE depuis un `ConversationMember` hérité sans
 * regarder la communauté qui héberge le salon. Un ancien membre d'une
 * communauté privée (parti, retiré) y retrouvait donc l'écriture et la
 * lecture que #16695 / #16704 lui retirent. Le pont n'entre désormais que
 * sous `mayReturnToSalon` : membre actif ou créateur d'une communauté privée
 * (ou désactivée) ; salon hors communauté ou communauté publique vivante,
 * inchangé ; une lecture qui échoue ne crée rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

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
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';


const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const COMMUNITY_ID = '507f1f77bcf86cd799439055';
const LEGACY_USER_ID = '507f1f77bcf86cd799439077';
const CREATOR_ID = '507f1f77bcf86cd799439088';

type CommunityRow = {
  readonly createdBy: string;
  readonly isPrivate: boolean;
  readonly isActive: boolean;
  readonly activeMemberIds: readonly string[];
};

type Scenario = {
  readonly communityId: string | null;
  readonly community?: CommunityRow | null;
  readonly communityLookupFails?: boolean;
};

const legacyUser = () => ({
  id: LEGACY_USER_ID, username: 'legacy', displayName: 'Legacy', firstName: null, lastName: null, avatar: null, systemLanguage: 'fr',
});

const createdParticipant = () => ({
  id: 'p-created', conversationId: CONVERSATION_ID, isActive: true, bannedAt: null,
  permissions: { canSendMessages: true }, anonymousSession: null,
});

const communityFindFirst = (scenario: Scenario) => jest.fn(async ({ where }: { where: { id: string } }) => {
  if (scenario.communityLookupFails) throw new Error('mongo indisponible');
  if (!scenario.community || where.id !== scenario.communityId) return null;
  const { createdBy, isPrivate, isActive, activeMemberIds } = scenario.community;
  return {
    createdBy, isPrivate, isActive,
    members: activeMemberIds.includes(LEGACY_USER_ID) ? [{ role: 'member' }] : [],
  };
});

const buildService = (scenario: Scenario) => {
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONVERSATION_ID, type: 'group', communityId: scenario.communityId })),
      findFirst: jest.fn(async () => ({ id: CONVERSATION_ID, identifier: 'salon', type: 'group', communityId: scenario.communityId })),
      update: jest.fn(async () => ({ id: CONVERSATION_ID, lastMessageAt: new Date() })),
    },
    community: { findFirst: communityFindFirst(scenario) },
    communityMember: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    participant: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => createdParticipant()),
    },
    message: {
      create: jest.fn(async () => ({
        id: 'm1', conversationId: CONVERSATION_ID, senderId: 'p-created', content: 'Bonjour',
        originalLanguage: 'fr', messageType: 'text', replyToId: null, deletedAt: null, isEdited: false,
        validatedMentions: [], createdAt: new Date(), updatedAt: new Date(),
        sender: { id: 'p-created', displayName: 'Legacy', avatar: null, role: 'member', isOnline: true, type: 'user', userId: LEGACY_USER_ID, language: 'fr' },
        attachments: [], replyTo: null,
      })),
      update: jest.fn(),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
    },
    trackingLink: { updateMany: jest.fn() },
    messageAttachment: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => legacyUser()), findMany: jest.fn(async () => []) },
    $runCommandRaw: jest.fn(async () => ({ cursor: { firstBatch: [{ role: 'MEMBER', isActive: true }] } })),
  };
  const notifications = {
    createMentionNotification: jest.fn(async () => ({ id: 'n1' })),
    createMentionNotificationsBatch: jest.fn(async () => 0),
  };
  const service = new MessagingService(
    prisma as unknown as PrismaClient,
    { handleNewMessage: mockHandleNewMessage } as never,
    notifications as never,
  );
  return { service, prisma };
};

const request: MessageRequest = { conversationId: CONVERSATION_ID, content: 'Bonjour' };

const privateCommunity = (overrides: Partial<CommunityRow> = {}): CommunityRow => ({
  createdBy: CREATOR_ID, isPrivate: true, isActive: true, activeMemberIds: [], ...overrides,
});

describe('MessagingService — le pont ConversationMember hérité suit la loi des salons (#16724)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ language: 'fr' }) }) as never;
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 1, participantCount: 2 });
    mockFindExistingTrackingLink.mockResolvedValue(null);
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockValidateMentionPermissions.mockResolvedValue({ isValid: true, validUserIds: [], invalidUsernames: [], errors: [] });
    mockMarkMessagesAsRead.mockResolvedValue(undefined);
    mockGetUnreadCount.mockResolvedValue(0);
  });

  it('ne recrée pas la participation d’un ancien membre d’une communauté privée', async () => {
    const { service, prisma } = buildService({ communityId: COMMUNITY_ID, community: privateCommunity() });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('ne recrée rien dans le salon d’une communauté publique DÉSACTIVÉE pour qui n’en est pas membre', async () => {
    const { service, prisma } = buildService({
      communityId: COMMUNITY_ID, community: privateCommunity({ isPrivate: false, isActive: false }),
    });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
  });

  it('ne recrée rien quand la lecture de la communauté échoue', async () => {
    const { service, prisma } = buildService({ communityId: COMMUNITY_ID, community: privateCommunity(), communityLookupFails: true });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
  });

  it('ne recrée rien quand la conversation n’est plus lisible', async () => {
    const { service, prisma } = buildService({ communityId: COMMUNITY_ID, community: privateCommunity() });
    prisma.conversation.findUnique.mockResolvedValue(null as never);

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
  });

  it('recrée la participation d’un membre ACTIF de la communauté privée', async () => {
    const { service, prisma } = buildService({
      communityId: COMMUNITY_ID, community: privateCommunity({ activeMemberIds: [LEGACY_USER_ID] }),
    });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
  });

  it('recrée la participation du CRÉATEUR de la communauté privée, même sans ligne de membre', async () => {
    const { service, prisma } = buildService({
      communityId: COMMUNITY_ID, community: privateCommunity({ createdBy: LEGACY_USER_ID }),
    });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
  });

  it('laisse inchangé le salon d’une communauté publique vivante', async () => {
    const { service, prisma } = buildService({
      communityId: COMMUNITY_ID, community: privateCommunity({ isPrivate: false }),
    });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
  });

  it('laisse inchangée une conversation hors communauté', async () => {
    const { service, prisma } = buildService({ communityId: null });

    const response = await service.handleMessage(request, LEGACY_USER_ID);

    expect(prisma.participant.create).toHaveBeenCalledTimes(1);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
  });
});
