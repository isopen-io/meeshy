/**
 * Le rail « vivants » est-il ALIMENTÉ ? — maquette normative §3, table
 * « Structure de l'écran », ligne « Rail stories & vivants » : « d'abord les
 * conversations où il se passe quelque chose MAINTENANT (Scène live, typing,
 * salve ✦) … disparaît si vide ».
 *
 * RE-PREUVE (2026-08-17, avant ce lot) :
 * `LentilleConversationListMount.tsx` ne construisait `liveEntries` que depuis
 * la section `live` — structurellement vide côté web (behaviour-matrix:L13,
 * `liveCall` sans source sur AUCUNE plateforme, `use-lentille-sections.ts:10`).
 * `LivesRail` rendait donc `null` à chaque rendu de production : un composant
 * bâti, testé unitairement, et jamais montré. Ces témoins regardent le rail
 * par le seul bout qui compte — le montage réel, avec le vrai `LivesRail`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

const mockUseLentilleListTyping = jest.fn(() => new Map());
jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => mockUseLentilleListTyping(),
}));

const mockUseLentilleBridges = jest.fn(() => new Map());
jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => mockUseLentilleBridges(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: any) => selector({ draftMessages: {} }),
}));

// Le rang lui-même a ses propres suites — ce fichier ne regarde que le rail.
jest.mock('../LentilleRow', () => ({
  LentilleRow: ({ conversation }: any) => <div data-testid="mock-lentille-row">{conversation.title}</div>,
}));

import { LentilleConversationListMount } from '../LentilleConversationListMount';

const makeUser = (): User =>
  ({ id: 'user-1', username: 'alice', displayName: 'Alice' } as unknown as User);

const conv = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    type: 'group',
    title: `Conv ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    lastMessageAt: new Date('2026-08-16T09:00:00.000Z'),
    unreadCount: 0,
    ...overrides,
  }) as unknown as Conversation;

const bridge = { kind: 'fallback', unreadCount: 3 } as unknown as ConversationBridge;

const baseProps = {
  currentUser: makeUser(),
  currentUserId: 'user-1',
  selectedConversationId: null as string | null,
  onSelectConversation: jest.fn(),
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  t: (key: string) => key,
};

beforeEach(() => {
  mockUseLentilleListTyping.mockReturnValue(new Map());
  mockUseLentilleBridges.mockReturnValue(new Map());
});

describe('LentilleConversationListMount — le rail des vivants', () => {
  it('rien ne vit ⇒ pas de rail (il disparaît si vide)', () => {
    render(<LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b')]} />);
    expect(screen.queryByTestId('lentille-lives-rail')).not.toBeInTheDocument();
  });

  it('quelqu’un ÉCRIT ⇒ le rail apparaît avec cette conversation', () => {
    mockUseLentilleListTyping.mockReturnValue(
      new Map([['b', [{ userId: 'user-2', displayName: 'Karim' }]]])
    );
    render(<LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b')]} />);

    const entries = screen.getAllByTestId('lentille-lives-rail-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveAttribute('data-kind', 'typing');
  });

  it('une SALVE ✦ (non lu + pont) ⇒ le rail apparaît', () => {
    mockUseLentilleBridges.mockReturnValue(new Map([['a', bridge]]));
    render(
      <LentilleConversationListMount
        {...baseProps}
        conversations={[conv('a', { unreadCount: 5 }), conv('b')]}
      />
    );

    const entries = screen.getAllByTestId('lentille-lives-rail-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveAttribute('data-kind', 'bridge');
  });
});
