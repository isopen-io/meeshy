/**
 * V4ter/axe — audit axe-core de la peau Lentille (drapeau ON).
 *
 * Verdict REV-4bis : « axe-core tourne en jsdom : à installer, pas à
 * reporter ». Ce fichier monte le VRAI point de montage
 * (`LentilleConversationListMount`) avec des rangs RÉELS (`LentilleRow`
 * n'est PAS mocké, contrairement à `LentilleConversationListMount.test.tsx`
 * — un audit d'accessibilité sur des `<div>` de substitution ne prouverait
 * rien) et une géométrie de conversations couvrant les cinq traits du rang
 * (non-lus, pont, épinglée, sourdine, typing).
 *
 * Mocks des feuilles REPRIS TELS QUELS de `LentilleRow.test.tsx` (Avatar,
 * OnlineIndicator, user-store, use-resolved-theme, use-i18n) — même recette
 * connue-fonctionnelle sous jsdom, aucune ré-invention.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

expect.extend(toHaveNoViolations);

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status, className }: any) =>
    status === 'offline' ? null : (
      <div data-testid="online-indicator" data-status={status} className={className} />
    ),
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'lentille.bridge.authorsOne') return String((params as any)?.name ?? '');
      if (key === 'lentille.bridge.authorsMany')
        return `${(params as any)?.name} et ${(params as any)?.count} autres`;
      if (key === 'lentille.bridge.messagesOne') return `${(params as any)?.count} message`;
      if (key === 'lentille.bridge.messagesMany') return `${(params as any)?.count} messages`;
      if (key === 'lentille.typing.one') return `${(params as any)?.name} écrit…`;
      return key;
    },
    isLoading: false,
  }),
}));

const typingMap = new Map([
  ['typing-1', [{ userId: 'u-typing', displayName: 'Chloé' }]],
]);
jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => typingMap,
}));

// Le pont est porté DIRECTEMENT par la conversation fixture (`bridge`), donc
// le substitut local reste vide — même patron que `resolveRowBridge`
// (`LentilleConversationListMount.tsx` : le champ `bridge` du fil est
// prioritaire sur `bridgesByConversation`).
jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => new Map(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: any) => selector({ draftMessages: {} }),
}));

import { LentilleConversationListMount } from '@/components/conversations/lentille/LentilleConversationListMount';

const makeUser = (): User =>
  ({ id: 'user-1', username: 'alice', displayName: 'Alice', email: 'a@a.com', role: 'USER' } as unknown as User);

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

const bridge: ConversationBridge = {
  kind: 'fallback',
  unreadCount: 3,
  suggestedMode: 'focal',
  data: { authors: ['Zoé'], extraAuthorCount: 1, messageCount: 3 },
};

/**
 * Géométrie réaliste — un rang par trait du contrat, RE-PROUVÉ contre
 * `LentilleRow.test.tsx` : non-lus (L06), pont (L02/L07), épinglée (L07),
 * sourdine (L07), typing (L01).
 */
const conversations: readonly Conversation[] = [
  conv('unread-1', {
    title: 'Équipe produit',
    unreadCount: 5,
    lastMessage: {
      id: 'm-unread',
      conversationId: 'unread-1',
      senderId: 'u-alice',
      content: 'On se voit demain ?',
      createdAt: new Date('2026-08-16T08:00:00Z'),
      attachments: [],
    } as any,
  }),
  conv('bridge-1', {
    title: 'Random',
    unreadCount: 3,
    ...({ bridge } as unknown as Partial<Conversation>),
  }),
  conv('pinned-1', { title: 'Amis proches', unreadCount: 0 }),
  conv('muted-1', { title: 'Newsletter équipe', unreadCount: 0 }),
  conv('typing-1', {
    title: 'Chloé',
    unreadCount: 0,
    lastMessage: {
      id: 'm-typing',
      conversationId: 'typing-1',
      senderId: 'u-chloe',
      content: 'Salut !',
      createdAt: new Date('2026-08-16T07:00:00Z'),
      attachments: [],
    } as any,
  }),
];

const preferencesMap = new Map([
  ['pinned-1', { isPinned: true, isMuted: false, isArchived: false } as any],
  ['muted-1', { isPinned: false, isMuted: true, isArchived: false } as any],
]);

const t = (key: string) => key;

describe('Audit axe — Lentille (liste, drapeau ON)', () => {
  it('aucune violation sur une géométrie réaliste (non-lus, pont, épinglée, sourdine, typing)', async () => {
    const { container } = render(
      <LentilleConversationListMount
        currentUser={makeUser()}
        currentUserId="user-1"
        conversations={conversations}
        selectedConversationId={null}
        onSelectConversation={() => {}}
        preferencesMap={preferencesMap}
        categories={[]}
        isLoading={false}
        t={t}
      />
    );

    /**
     * FINDING V4ter/axe — `nested-interactive` : **SOLDÉ le 2026-08-17
     * (Q-142, réserve REV-4ter R5-7, condition d'activation V6).**
     *
     * CE QUI ÉTAIT DÉSACTIVÉ ICI, et pourquoi ça ne l'est plus. Le rang
     * posait `role="button" tabIndex={0}` sur sa RACINE, et trois contrôles
     * réels vivaient dedans (avatar L12, encoche WL-108, ⋮ WL-106). La règle
     * tirait sur les cinq rangs de cette géométrie. La désactivation était
     * datée et locale ; elle a été RETIRÉE AVANT le correctif — c'est ce
     * retrait qui a produit le RED (5 violations, une par rang).
     *
     * Le remède (patron « card action ») vit dans `LentilleRow.tsx` : la
     * racine est un conteneur muet, l'ouverture est un `<button>` FRÈRE qui
     * couvre le rang (`lentille-row-open`). L'invariant structurel — aucun
     * ancêtre interactif au-dessus des trois contrôles — et les quatre
     * arrêts de tabulation distincts sont figés par
     * `components/conversations/lentille/__tests__/LentilleRow.cover-action.test.tsx`.
     *
     * `axe(container)` NU : toutes les règles, aucune exception.
     */
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation sur le squelette de chargement initial', async () => {
    const { container } = render(
      <LentilleConversationListMount
        currentUser={makeUser()}
        currentUserId="user-1"
        conversations={[]}
        selectedConversationId={null}
        onSelectConversation={() => {}}
        preferencesMap={new Map()}
        categories={[]}
        isLoading={true}
        t={t}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation sur la branche vide (aucune conversation)', async () => {
    const { container } = render(
      <LentilleConversationListMount
        currentUser={makeUser()}
        currentUserId="user-1"
        conversations={[]}
        selectedConversationId={null}
        onSelectConversation={() => {}}
        preferencesMap={new Map()}
        categories={[]}
        isLoading={false}
        searchQuery=""
        t={t}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
