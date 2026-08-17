/**
 * WL-105 (LWS-10) — câblage du Prisme Linguistique sur `LentilleRow`.
 *
 * Miroir du test de câblage de `ConversationItem`
 * (`conversation-item/__tests__/ConversationItem.prisme.test.tsx`) — cette
 * suite prouve que `LentilleRow` emprunte EXACTEMENT le même chemin
 * (`formatLastMessage` → `resolveLastMessagePreview`), pas une réimplémentation
 * qui pourrait diverger.
 *
 * Règle #3 du Prisme (ordre, pas appartenance) : prisme `['fr', 'en']`,
 * message original en anglais, traduction française disponible ⇒ « Bonjour »
 * — jamais l'original anglais, même si l'anglais figure plus bas dans le
 * prisme du lecteur.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
  AvatarImage: () => null,
}));
jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: () => null,
}));
jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

import { LentilleRow } from '../LentilleRow';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: 'USER',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as User;

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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
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

const t = (key: string) => key;

describe('LentilleRow — câblage du Prisme Linguistique', () => {
  it("règle #3 : prisme ['fr','en'], original en, traduction fr disponible ⇒ « Bonjour », jamais l'anglais", () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessageTranslations: { fr: 'Bonjour' },
          lastMessageOriginalLanguage: 'en',
        })}
        currentUser={makeUser({ systemLanguage: 'fr', regionalLanguage: 'en' })}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    expect(screen.getByTestId('lentille-row').textContent).toContain('Bonjour');
    expect(screen.getByTestId('lentille-row').textContent).not.toContain('Hello everyone');
  });

  it("retombe sur l'original quand aucune traduction ne dessert le lecteur (jamais une traduction quelconque)", () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessageTranslations: { es: 'Hola a todos' },
          lastMessageOriginalLanguage: 'en',
        })}
        currentUser={makeUser({ systemLanguage: 'de', regionalLanguage: 'de' })}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    expect(screen.getByTestId('lentille-row').textContent).toContain('Hello everyone');
    expect(screen.getByTestId('lentille-row').textContent).not.toContain('Hola a todos');
  });

  it("descend sur la langue régionale du lecteur quand la primaire n'a pas de traduction", () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessageTranslations: { es: 'Hola a todos' },
          lastMessageOriginalLanguage: 'en',
        })}
        currentUser={makeUser({ systemLanguage: 'de', regionalLanguage: 'es' })}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    expect(screen.getByTestId('lentille-row').textContent).toContain('Hola a todos');
  });
});
