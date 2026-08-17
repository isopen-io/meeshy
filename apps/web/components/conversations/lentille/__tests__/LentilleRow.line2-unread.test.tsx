/**
 * Fidélité Lentille — la LIGNE 2 d'un rang NON LU, et le pont d'un rang en
 * SOURDINE. Maquette normative
 * `docs/design/2026-08-15-conversation-list-lentille.html` :
 *
 *  - CSS `.crow .l2{color:var(--ink3)}` (tertiaire au repos) MAIS
 *    `.crow.unread .l2{color:var(--m-text); font-weight:600}` : un rang non lu
 *    porte sa ligne 2 en texte PRIMAIRE, plus grasse. Le rendu pose la classe
 *    `unread` dès `c.unread && !c.typing`.
 *  - §1, table « État du rang » : « **Sourdine** — Rang à 55 % d'opacité,
 *    **pont grisé** ». Le rendu le dit deux fois : `c.unread && c.pont &&
 *    !c.muted` ⇒ `<span class="pont">` (teinté accent) ; `c.unread && c.pont
 *    && c.muted` ⇒ `✦ ${pont}` NU — pas de classe `.pont`, donc pas de teinte
 *    d'accent, seulement la ligne 2 de non-lu.
 *
 * RE-PREUVE (2026-08-17, avant ce lot) : `LentilleRow.tsx` posait
 * `text-muted-foreground` sur le conteneur de ligne 2 en TOUTES circonstances,
 * et `LentilleBridgeLine` teintait le pont à l'accent même en sourdine. Le
 * non-lu n'avait donc aucune traduction typographique, et la sourdine ne
 * grisait que par l'opacité du rang.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
  AvatarImage: () => null,
}));

jest.mock('@/components/ui/online-indicator', () => ({ OnlineIndicator: () => null }));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'light' }));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'lentille.bridge.messagesOther') return `${(params as any)?.count} messages`;
      return key;
    },
    isLoading: false,
  }),
}));

import { LentilleRow } from '../LentilleRow';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';

const t = (key: string, params?: Record<string, unknown> | string) => {
  if (typeof params === 'object' && params && key === 'lentille.bridge.messagesOther') {
    return `${(params as any).count} messages`;
  }
  return key;
};

const makeUser = (): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    systemLanguage: 'fr',
    isOnline: true,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }) as unknown as User;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Colocation Balzac',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 4,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    unreadCount: 0,
    lastMessage: {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Jules : je paie et on divise ?',
      originalLanguage: 'fr',
      createdAt: new Date('2026-06-01T22:41:00.000Z'),
    },
    ...overrides,
  }) as unknown as Conversation;

const bridge: ConversationBridge = {
  kind: 'fallback',
  unreadCount: 5,
  isComplete: true,
  data: { authors: [], messageCount: 5, media: {} },
} as unknown as ConversationBridge;

afterEach(() => {
  useConversationPreferencesStore.setState({ preferencesMap: new Map() });
});

function renderRow(props: Partial<React.ComponentProps<typeof LentilleRow>> = {}) {
  return render(
    <LentilleRow
      conversation={makeConversation()}
      currentUser={makeUser()}
      isSelected={false}
      onSelect={() => {}}
      t={t}
      {...props}
    />
  );
}

describe('LentilleRow — ligne 2 d’un rang NON LU (maquette `.crow.unread .l2`)', () => {
  it('tout lu ⇒ ligne 2 tertiaire, jamais renforcée', () => {
    renderRow();
    const line2 = screen.getByTestId('lentille-row-line2');
    expect(line2.className).toContain('text-muted-foreground');
    expect(line2.className).not.toContain('font-semibold');
  });

  it('non lu ⇒ ligne 2 en texte primaire et plus grasse', () => {
    renderRow({ conversation: makeConversation({ unreadCount: 5 }) });
    const line2 = screen.getByTestId('lentille-row-line2');
    expect(line2.className).toContain('text-foreground');
    expect(line2.className).toContain('font-semibold');
    expect(line2.className).not.toContain('text-muted-foreground');
  });

  it('typing ⇒ PAS la ligne 2 de non-lu (la maquette pose `unread` seulement si `!c.typing`)', () => {
    renderRow({
      conversation: makeConversation({ unreadCount: 5 }),
      typingUsers: [{ userId: 'user-2', displayName: 'Karim' }],
    });
    const line2 = screen.getByTestId('lentille-row-line2');
    expect(line2.className).toContain('text-muted-foreground');
    expect(line2.className).not.toContain('font-semibold');
  });
});

describe('LentilleRow — pont GRISÉ en sourdine (maquette §1, table « État du rang »)', () => {
  it('non lu + pont, hors sourdine ⇒ pont teinté à l’accent', () => {
    renderRow({ conversation: makeConversation({ unreadCount: 5 }), bridge });
    const line = screen.getByTestId('lentille-bridge-line');
    expect(line.style.color).not.toBe('');
  });

  it('non lu + pont EN SOURDINE ⇒ aucune teinte d’accent, le pont hérite de la ligne 2', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([
        ['conv-1', { isPinned: false, isMuted: true, isArchived: false, tags: [] } as any],
      ]),
    });
    renderRow({ conversation: makeConversation({ unreadCount: 5 }), bridge });

    const line = screen.getByTestId('lentille-bridge-line');
    expect(line.style.color).toBe('');
    // Le pont reste LU : c'est sa teinte qui s'efface, jamais son texte.
    expect(line).toHaveTextContent('5 messages');
  });
});
