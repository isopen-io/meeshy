import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationItem } from '../ConversationItem';
import type { Conversation, SocketIOUser } from '@meeshy/shared/types';

/**
 * Cycle 61 — le CÂBLAGE du Prisme Linguistique sur la ligne de liste.
 *
 * `resolveLastMessagePreview` (shared) épingle la RÈGLE et `formatLastMessage`
 * épingle son application au texte. Aucun des deux ne peut voir le défaut
 * d'origine : la ligne de liste ne leur passait tout simplement jamais ni la
 * carte de traductions ni les langues du lecteur. C'est la même famille de trou
 * que la leçon 105 — une convention tenue par les APPELANTS n'est pas testée
 * par ce qui la consomme — et ce fichier est le seul garde-fou possible.
 */

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

const renderRow = (conversation: Conversation, currentUser: SocketIOUser) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationItem
        conversation={conversation}
        isSelected={false}
        currentUser={currentUser}
        onClick={() => {}}
        t={(key: string) => key}
      />
    </QueryClientProvider>
  );
};

describe('ConversationItem — câblage du Prisme Linguistique', () => {
  it("affiche l'aperçu dans la langue du lecteur, pas celle de l'expéditeur", () => {
    const { container } = renderRow(
      makeConversation({
        lastMessageTranslations: { fr: 'Bonjour tout le monde' },
        lastMessageOriginalLanguage: 'en',
      }),
      makeUser({ systemLanguage: 'fr' })
    );
    expect(container.textContent).toContain('Bonjour tout le monde');
    expect(container.textContent).not.toContain('Hello everyone');
  });

  it("retombe sur l'original quand le lecteur n'a aucune traduction disponible", () => {
    // Règle #3 : jamais de repli sur une traduction quelconque — l'espagnol
    // disponible ne doit pas atteindre un lecteur allemand.
    const { container } = renderRow(
      makeConversation({
        lastMessageTranslations: { es: 'Hola a todos' },
        lastMessageOriginalLanguage: 'en',
      }),
      makeUser({ systemLanguage: 'de', regionalLanguage: 'de' })
    );
    expect(container.textContent).toContain('Hello everyone');
    expect(container.textContent).not.toContain('Hola a todos');
  });

  it("descend sur la langue régionale du lecteur quand la primaire n'a pas de traduction", () => {
    // Prouve que l'ORDRE du prisme traverse le câblage : une implémentation qui
    // ne passerait que `systemLanguage` rendrait l'original ici.
    const { container } = renderRow(
      makeConversation({
        lastMessageTranslations: { es: 'Hola a todos' },
        lastMessageOriginalLanguage: 'en',
      }),
      makeUser({ systemLanguage: 'de', regionalLanguage: 'es' })
    );
    expect(container.textContent).toContain('Hola a todos');
  });

  it("affiche l'original quand le serveur n'envoie aucune traduction", () => {
    const { container } = renderRow(
      makeConversation(),
      makeUser({ systemLanguage: 'fr' })
    );
    expect(container.textContent).toContain('Hello everyone');
  });
});
