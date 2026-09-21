/**
 * G3 (#7218, Closes #7001) — `aps.badge` compte les CONVERSATIONS non lues,
 * hors muettes, exactement comme `NotificationCoordinator.conversationUnreadTotal`
 * sur iOS (`ConversationReadLedger.total(excludingOpen:excludingMuted:)`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedger.swift:270-279`)
 * et comme `countUnreadConversations` sur web-v2
 * (`apps/web-v2/src/lib/view/use-app-badge.ts:36-45`, W4/#7221).
 *
 * D-L1 (`docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md` § 3) :
 * une conversation avec des non-lus pèse 1, quel que soit son nombre de
 * messages — jamais une somme de messages (voir #7236, écart iOS non
 * bloquant pour ce lot).
 *
 * @jest-environment node
 */

import { computeConversationUnreadBadge } from '../../../services/notifications/conversationUnreadBadge';

type MockPrisma = {
  participant: { findMany: jest.Mock };
  conversationReadCursor: { findMany: jest.Mock };
  userConversationPreferences: { findMany: jest.Mock };
};

function makePrisma(): MockPrisma {
  return {
    participant: { findMany: jest.fn() },
    conversationReadCursor: { findMany: jest.fn() },
    userConversationPreferences: { findMany: jest.fn() },
  };
}

const USER_ID = 'user-1';

describe('computeConversationUnreadBadge — D-L1 : des CONVERSATIONS, pas des messages', () => {
  it('test_countsOneConversationWithUnread_asOne_regardlessOfMessageCount', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([
      { id: 'participant-a', conversationId: 'conv-a' },
    ]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      { conversationId: 'conv-a', unreadCount: 12 },
    ]);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(1);
  });

  it('test_countsEachUnreadConversationOnce_notTheirMessageSum', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([
      { id: 'participant-a', conversationId: 'conv-a' },
      { id: 'participant-b', conversationId: 'conv-b' },
      { id: 'participant-c', conversationId: 'conv-c' },
    ]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      { conversationId: 'conv-a', unreadCount: 1 },
      { conversationId: 'conv-b', unreadCount: 40 },
      { conversationId: 'conv-c', unreadCount: 0 },
    ]);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(2);
  });
});

describe('computeConversationUnreadBadge — hors muettes (D-L1)', () => {
  it('test_excludesMutedConversations_fromTheCount', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([
      { id: 'participant-a', conversationId: 'conv-a' },
      { id: 'participant-muted', conversationId: 'conv-muted' },
    ]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      { conversationId: 'conv-a', unreadCount: 3 },
      { conversationId: 'conv-muted', unreadCount: 9 },
    ]);
    prisma.userConversationPreferences.findMany.mockResolvedValue([
      { conversationId: 'conv-muted' },
    ]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(1);
  });
});

describe('computeConversationUnreadBadge — cas vide', () => {
  it('test_returnsZero_whenNoParticipantResolves', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(0);
    expect(prisma.conversationReadCursor.findMany).not.toHaveBeenCalled();
  });

  it('test_returnsZero_whenNoCursorHasUnread', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([
      { id: 'participant-a', conversationId: 'conv-a' },
    ]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([]);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(0);
  });

  it('test_aFriendRequestNotification_doesNotIncrementTheBadge', async () => {
    // Une demande d'ami ne crée ni Participant ni ConversationReadCursor : la
    // projection du badge reste 0 pour un destinataire qui n'a que ça — la
    // cloche (notification:counts) est seule à en parler (D-L1).
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([]);

    const badge = await computeConversationUnreadBadge(
      prisma as unknown as Parameters<typeof computeConversationUnreadBadge>[0],
      USER_ID
    );

    expect(badge).toBe(0);
  });
});
