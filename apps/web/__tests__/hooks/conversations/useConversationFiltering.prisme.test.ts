import { renderHook } from '@testing-library/react';
import { useConversationFiltering } from '@/components/conversations/hooks/useConversationFiltering';
import type { Conversation, SocketIOUser } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import type { CommunityFilter } from '@/components/conversations/CommunityCarousel';

/**
 * Contrat Lentille LWS-9 — la recherche de la liste doit matcher le PRÉVIEW
 * RÉSOLU PAR LE PRISME (ce que le lecteur VOIT), pas le contenu original du
 * dernier message. Même défaut de câblage que la leçon 105 / cycle 61 sur
 * ConversationItem : une convention tenue par les appelants (passer les
 * traductions + les langues du lecteur à `resolveLastMessagePreview`) n'était
 * jamais honorée par le filtrage de recherche.
 *
 * Drapeau ÉTEINT : ce correctif ne dépend d'aucun flag Lentille.
 */

const ALL_FILTER: CommunityFilter = { type: 'all' };

const makeUser = (overrides: Partial<SocketIOUser> = {}): SocketIOUser =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: false,
    isOnline: true,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as unknown as SocketIOUser;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    lastMessageAt: new Date('2026-06-01T10:00:00.000Z'),
    unreadCount: 0,
    lastMessage: {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Hello everyone',
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      attachments: [],
    },
    ...overrides,
  }) as unknown as Conversation;

const runFiltering = (params: {
  conversations: Conversation[];
  searchQuery: string;
  currentUser: SocketIOUser;
  preferencesMap?: Map<string, UserConversationPreferences>;
}) =>
  renderHook(() =>
    useConversationFiltering({
      conversations: params.conversations,
      searchQuery: params.searchQuery,
      selectedFilter: ALL_FILTER,
      preferencesMap: params.preferencesMap ?? new Map(),
      currentUser: params.currentUser,
    })
  ).result.current;

describe('useConversationFiltering — recherche sur le préview résolu par le Prisme', () => {
  it('« Bonjour » trouve une conversation dont l\'original est « Hello » et la traduction lue « Bonjour »', () => {
    const conversation = makeConversation({
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'Hello',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        attachments: [],
      } as unknown as Conversation['lastMessage'],
      lastMessageTranslations: { fr: 'Bonjour' },
      lastMessageOriginalLanguage: 'en',
    });

    const result = runFiltering({
      conversations: [conversation],
      searchQuery: 'Bonjour',
      currentUser: makeUser({ systemLanguage: 'fr' }),
    });

    expect(result.map((c) => c.id)).toEqual(['conv-1']);
  });

  it('« Hello » ne trouve PAS la conversation quand la langue lue (fr) a une traduction — on cherche ce qu\'on voit', () => {
    const conversation = makeConversation({
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'Hello',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        attachments: [],
      } as unknown as Conversation['lastMessage'],
      lastMessageTranslations: { fr: 'Bonjour' },
      lastMessageOriginalLanguage: 'en',
    });

    const result = runFiltering({
      conversations: [conversation],
      searchQuery: 'Hello',
      currentUser: makeUser({ systemLanguage: 'fr' }),
    });

    expect(result).toEqual([]);
  });

  it("retombe sur l'original quand le lecteur n'a aucune traduction disponible (règle #3)", () => {
    const conversation = makeConversation({
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'Hello everyone',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        attachments: [],
      } as unknown as Conversation['lastMessage'],
      lastMessageTranslations: { es: 'Hola a todos' },
      lastMessageOriginalLanguage: 'en',
    });

    const result = runFiltering({
      conversations: [conversation],
      searchQuery: 'Hello',
      currentUser: makeUser({ systemLanguage: 'de', regionalLanguage: 'de' }),
    });

    expect(result.map((c) => c.id)).toEqual(['conv-1']);
  });

  it('le titre continue de matcher comme avant', () => {
    const conversation = makeConversation({ title: 'Équipe produit' });

    const result = runFiltering({
      conversations: [conversation],
      searchQuery: 'produit',
      currentUser: makeUser(),
    });

    expect(result.map((c) => c.id)).toEqual(['conv-1']);
  });
});
