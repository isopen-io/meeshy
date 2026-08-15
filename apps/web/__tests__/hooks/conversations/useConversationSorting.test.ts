import { renderHook } from '@testing-library/react';
import { useConversationSorting } from '@/components/conversations/hooks/useConversationSorting';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';

/**
 * Contrat Lentille LWS-9, écart E11 — le hook déléguait son tri à
 * `a.lastMessage?.createdAt` (useConversationSorting.ts:43-44) au lieu de la
 * loi partagée `sortConversations` (`packages/shared/utils/conversation-sections.ts`),
 * qui trie sur `lastMessageAt` (repli `updatedAt`) et interdit explicitement
 * la lecture de `lastMessage.createdAt`. Re-preuve S-001.
 *
 * Provenance réelle de pin/catégorie dans ce hook : AUCUN champ de
 * `Conversation` — tout vient de `preferencesMap.get(conversation.id)`
 * (`UserConversationPreferences.isPinned` / `.categoryId` /
 * `.orderInCategory`), jamais de `conversation.userPreferences` ni d'un champ
 * dérivé côté `Conversation` (voir useConversationSorting.ts:33-36,59-61
 * avant correctif).
 */

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Conversation',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    unreadCount: 0,
    ...overrides,
  }) as unknown as Conversation;

const makePrefs = (
  overrides: Partial<UserConversationPreferences> = {}
): UserConversationPreferences =>
  ({
    id: 'prefs-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    isPinned: false,
    isMuted: false,
    isArchived: false,
    tags: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as UserConversationPreferences;

const runSorting = (params: {
  conversations: Conversation[];
  preferencesMap?: Map<string, UserConversationPreferences>;
  categories?: UserConversationCategory[];
}) =>
  renderHook(() =>
    useConversationSorting({
      conversations: params.conversations,
      preferencesMap: params.preferencesMap ?? new Map(),
      categories: params.categories ?? [],
    })
  ).result.current;

describe('useConversationSorting — délégation à sortConversations (loi partagée, E11)', () => {
  it("classe sur lastMessageAt, JAMAIS sur lastMessage.createdAt — une conversation avec un lastMessage.createdAt récent mais un lastMessageAt ancien PERD contre une conversation dont le lastMessageAt est plus récent", () => {
    const staleLastMessageAtButFreshCreatedAt = makeConversation({
      id: 'conv-stale-lastMessageAt',
      lastMessageAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-stale-lastMessageAt',
        senderId: 'user-2',
        content: 'Message récent en apparence',
        createdAt: new Date('2026-08-14T00:00:00.000Z'),
        attachments: [],
      } as unknown as Conversation['lastMessage'],
    });

    const freshLastMessageAtButStaleCreatedAt = makeConversation({
      id: 'conv-fresh-lastMessageAt',
      lastMessageAt: new Date('2026-08-14T00:00:00.000Z'),
      updatedAt: new Date('2026-08-14T00:00:00.000Z'),
      lastMessage: {
        id: 'msg-2',
        conversationId: 'conv-fresh-lastMessageAt',
        senderId: 'user-2',
        content: 'Message ancien en apparence',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        attachments: [],
      } as unknown as Conversation['lastMessage'],
    });

    const groups = runSorting({
      conversations: [staleLastMessageAtButFreshCreatedAt, freshLastMessageAtButStaleCreatedAt],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('uncategorized');
    expect(groups[0].conversations.map((c) => c.id)).toEqual([
      'conv-fresh-lastMessageAt',
      'conv-stale-lastMessageAt',
    ]);
  });

  it('retombe sur updatedAt quand lastMessageAt est absent (repli de la loi partagée)', () => {
    const withLastMessageAt = makeConversation({
      id: 'conv-with-lastMessageAt',
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const withoutLastMessageAtButRecentUpdatedAt = makeConversation({
      id: 'conv-without-lastMessageAt',
      lastMessageAt: undefined,
      updatedAt: new Date('2026-08-14T00:00:00.000Z'),
    });

    const groups = runSorting({
      conversations: [withLastMessageAt, withoutLastMessageAtButRecentUpdatedAt],
    });

    expect(groups[0].conversations.map((c) => c.id)).toEqual([
      'conv-without-lastMessageAt',
      'conv-with-lastMessageAt',
    ]);
  });

  it("pin et catégorie viennent de preferencesMap — jamais d'un champ de Conversation elle-même", () => {
    const conversation = makeConversation({
      id: 'conv-1',
      // Le hook ne doit JAMAIS lire ces champs pour trier/grouper : la
      // conversation elle-même ne porte pas de pin/catégorie exploitable.
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const groupsWithoutPrefsEntry = runSorting({
      conversations: [conversation],
      preferencesMap: new Map(), // aucune entrée pour conv-1
    });
    expect(groupsWithoutPrefsEntry[0].type).toBe('uncategorized');

    const groupsWithPrefsEntry = runSorting({
      conversations: [conversation],
      preferencesMap: new Map([
        ['conv-1', makePrefs({ conversationId: 'conv-1', isPinned: true })],
      ]),
    });
    expect(groupsWithPrefsEntry[0].type).toBe('pinned');
  });

  it('les conversations épinglées restent en tête (non-régression)', () => {
    const pinned = makeConversation({
      id: 'conv-pinned',
      lastMessageAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const unpinnedRecent = makeConversation({
      id: 'conv-unpinned',
      lastMessageAt: new Date('2026-08-14T00:00:00.000Z'),
    });

    const groups = runSorting({
      conversations: [unpinnedRecent, pinned],
      preferencesMap: new Map([
        ['conv-pinned', makePrefs({ conversationId: 'conv-pinned', isPinned: true })],
      ]),
    });

    expect(groups[0].type).toBe('pinned');
    expect(groups[0].conversations.map((c) => c.id)).toEqual(['conv-pinned']);
    expect(groups[1].type).toBe('uncategorized');
    expect(groups[1].conversations.map((c) => c.id)).toEqual(['conv-unpinned']);
  });

  it('trie par orderInCategory à l\'intérieur d\'une catégorie', () => {
    const categories: UserConversationCategory[] = [
      {
        id: 'cat-1',
        userId: 'user-1',
        name: 'Travail',
        order: 0,
        isExpanded: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const second = makeConversation({ id: 'conv-second', lastMessageAt: new Date('2026-08-14T00:00:00.000Z') });
    const first = makeConversation({ id: 'conv-first', lastMessageAt: new Date('2020-01-01T00:00:00.000Z') });

    const groups = runSorting({
      conversations: [second, first],
      categories,
      preferencesMap: new Map([
        ['conv-second', makePrefs({ conversationId: 'conv-second', categoryId: 'cat-1', orderInCategory: 1 })],
        ['conv-first', makePrefs({ conversationId: 'conv-first', categoryId: 'cat-1', orderInCategory: 0 })],
      ]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('category');
    expect(groups[0].categoryId).toBe('cat-1');
    // orderInCategory (0 avant 1) prime sur lastMessageAt malgré des dates inverses.
    expect(groups[0].conversations.map((c) => c.id)).toEqual(['conv-first', 'conv-second']);
  });
});
