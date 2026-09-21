/**
 * G3 (#7218, Refs #7001) — `aps.badge` compte les CONVERSATIONS non lues,
 * hors muettes, exactement comme `NotificationCoordinator.conversationUnreadTotal`
 * sur iOS (`ConversationReadLedger.total(excludingOpen:excludingMuted:)`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedger.swift:272-281`)
 * et comme `countUnreadConversations` sur web-v2
 * (`apps/web-v2/src/lib/view/use-app-badge.ts:36-45`, W4/#7221).
 *
 * **Le faux Prisma de ce fichier modélise la BASE telle qu'elle est, pas
 * telle qu'elle arrangerait le calcul** : `ConversationReadCursor.unreadCount`
 * y vaut toujours `0`, parce que le dépôt ne l'incrémente NULLE PART à
 * l'arrivée d'un message (seules écritures : `0` à l'avance de curseur,
 * `1` au geste « marquer non lu »). Un témoin qui fabriquerait des curseurs à
 * `unreadCount: 12` verdirait sur une implémentation qui, en production,
 * rendrait `0` à tout le monde. Le non-lu se lit donc, ici comme dans la
 * liste, des MESSAGES postérieurs au curseur.
 *
 * @jest-environment node
 */

import { computeConversationUnreadBadge } from '../../../services/notifications/conversationUnreadBadge';

const USER_ID = 'user-1';

type ConversationFixture = {
  readonly conversationId: string;
  readonly participantId: string;
  /** Messages d'autrui postérieurs au curseur de lecture — le VRAI non-lu. */
  readonly unreadMessages: number;
  readonly isMuted?: boolean;
};

type Where = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Faux Prisma fidèle aux trois requêtes que la chaîne réelle émet
 * (`participant.findMany`, `conversationReadCursor.findMany`,
 * `userConversationPreferences.findMany` + le masquage personnel), et qui
 * DISPATCHE sur le `where` comme le vrai — deux appelants lisent
 * `userConversationPreferences` avec deux filtres différents.
 */
function makePrisma(fixtures: readonly ConversationFixture[]) {
  const byConversation = new Map(fixtures.map((f) => [f.conversationId, f]));
  const counted: string[] = [];

  return {
    counted,
    prisma: {
      participant: {
        findMany: jest.fn(async ({ where }: { where: Where }) => {
          const rows = fixtures
            .filter((f) =>
              where.conversationId?.in ? where.conversationId.in.includes(f.conversationId) : true
            )
            .map((f) => ({
              id: f.participantId,
              userId: USER_ID,
              conversationId: f.conversationId,
              joinedAt: null,
            }));
          return rows;
        }),
      },
      conversationReadCursor: {
        // Honore `where.unreadCount` : une implémentation qui filtrerait sur
        // le champ dénormalisé ne verrait AUCUNE ligne — c'est ce que la base
        // lui rendrait aussi, et c'est ce qui rend ces témoins rouges pour
        // elle.
        findMany: jest.fn(async ({ where }: { where: Where }) =>
          (where?.unreadCount?.gt !== undefined ? [] : fixtures).map((f) => ({
            participantId: f.participantId,
            lastReadAt: new Date('2026-09-20T00:00:00.000Z'),
            lastReadMessageCreatedAt: new Date('2026-09-20T00:00:00.000Z'),
            // La réalité de la base : jamais incrémenté à l'arrivée d'un message.
            unreadCount: 0,
          }))
        ),
      },
      userConversationPreferences: {
        findMany: jest.fn(async ({ where }: { where: Where }) => {
          if (where.isMuted === true) {
            return fixtures
              .filter((f) => f.isMuted)
              .map((f) => ({ conversationId: f.conversationId }));
          }
          return [];
        }),
      },
      userMessageDeletion: { findMany: jest.fn(async () => []) },
      message: {
        count: jest.fn(async ({ where }: { where: Where }) => {
          counted.push(where.conversationId);
          return byConversation.get(where.conversationId)?.unreadMessages ?? 0;
        }),
      },
    },
  };
}

function badgeOf(prisma: unknown): Promise<number> {
  return computeConversationUnreadBadge(
    prisma as Parameters<typeof computeConversationUnreadBadge>[0],
    USER_ID
  );
}

describe('computeConversationUnreadBadge — D-L1 : des CONVERSATIONS, pas des messages', () => {
  it('test_countsOneConversationWithUnread_asOne_regardlessOfMessageCount', async () => {
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 12 },
    ]);

    await expect(badgeOf(prisma)).resolves.toBe(1);
  });

  it('test_countsEachUnreadConversationOnce_notTheirMessageSum', async () => {
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 1 },
      { conversationId: 'conv-b', participantId: 'participant-b', unreadMessages: 40 },
      { conversationId: 'conv-c', participantId: 'participant-c', unreadMessages: 0 },
    ]);

    await expect(badgeOf(prisma)).resolves.toBe(2);
  });

  it('test_countsUnreadMessages_notTheDenormalizedCursorField', async () => {
    // Le champ `ConversationReadCursor.unreadCount` vaut 0 partout (voir
    // l'en-tête) : une implémentation qui le lirait rendrait 0 ici. Le badge
    // doit valoir 2 — c'est ce témoin qui sépare les deux lois.
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 3 },
      { conversationId: 'conv-b', participantId: 'participant-b', unreadMessages: 7 },
    ]);

    await expect(badgeOf(prisma)).resolves.toBe(2);
  });
});

describe('computeConversationUnreadBadge — hors muettes (D-L1)', () => {
  it('test_excludesMutedConversations_fromTheCount', async () => {
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 3 },
      { conversationId: 'conv-muted', participantId: 'participant-muted', unreadMessages: 9, isMuted: true },
    ]);

    await expect(badgeOf(prisma)).resolves.toBe(1);
  });

  it('test_doesNotEvenCountMessagesOfAMutedConversation', async () => {
    const { prisma, counted } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 3 },
      { conversationId: 'conv-muted', participantId: 'participant-muted', unreadMessages: 9, isMuted: true },
    ]);

    await badgeOf(prisma);

    expect(counted).toEqual(['conv-a']);
  });
});

describe('computeConversationUnreadBadge — cas vide et panne', () => {
  it('test_returnsZero_whenNoParticipantResolves', async () => {
    const { prisma } = makePrisma([]);

    await expect(badgeOf(prisma)).resolves.toBe(0);
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it('test_returnsZero_whenEveryConversationIsRead', async () => {
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 0 },
    ]);

    await expect(badgeOf(prisma)).resolves.toBe(0);
  });

  it('test_aFriendRequestRecipientWithoutConversations_hasNoBadge', async () => {
    // Une demande d'ami ne crée ni Participant ni conversation : la projection
    // du badge reste 0 — la cloche (`notification:counts`) est seule à en
    // parler (D-L1).
    const { prisma } = makePrisma([]);

    await expect(badgeOf(prisma)).resolves.toBe(0);
  });

  it('test_throws_whenUnreadCountsAreUnavailable_soTheCallerOmitsTheBadge', async () => {
    // `getUnreadCountsForUser` avale sa panne et rend une Map VIDE. Servir 0
    // EFFACERAIT l'icône du destinataire : on lève, l'appelant omet le badge.
    const { prisma } = makePrisma([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 3 },
    ]);
    prisma.message.count.mockRejectedValue(new Error('db down'));

    await expect(badgeOf(prisma)).rejects.toThrow();
  });
});
