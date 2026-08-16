/**
 * `LentilleConversationListMount` — WL-102/WL-103 (LWS-10).
 *
 * Le placeholder de WL-101 est remplacé par le rendu réel : ces tests
 * verrouillent l'ORCHESTRATION (sections, squelette, rail, typing/bridge
 * transmis aux rangs) — le comportement de `LentilleRow` lui-même est
 * couvert par ses propres suites (`LentilleRow.test.tsx`), donc mocké ici
 * pour isoler ce qui est propre au point de montage.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

const mockUseLentilleListTyping = jest.fn((_currentUserId: string | null | undefined) => new Map());
jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: (currentUserId: string | null | undefined) => mockUseLentilleListTyping(currentUserId),
}));

jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => new Map(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: any) => selector({ draftMessages: {} }),
}));

const rowElections: unknown[] = [];
jest.mock('../LentilleRow', () => ({
  LentilleRow: ({ conversation, onClick, election }: any) => {
    rowElections.push(election);
    return (
      <div data-testid="mock-lentille-row" data-id={conversation.id} onClick={onClick}>
        {conversation.title}
      </div>
    );
  },
}));

import { LentilleConversationListMount } from '../LentilleConversationListMount';

const makeUser = (): User => ({ id: 'user-1', username: 'alice', displayName: 'Alice', email: 'a@a.com', role: 'USER' } as unknown as User);

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

const t = (key: string) => key;

const baseProps = {
  currentUser: makeUser(),
  selectedConversationId: null as string | null,
  onSelectConversation: jest.fn(),
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  t,
};

describe('LentilleConversationListMount', () => {
  beforeEach(() => {
    mockUseLentilleListTyping.mockClear();
    (baseProps.onSelectConversation as jest.Mock).mockClear();
  });

  it('rend un point de montage identifiable', () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a')]} />);
    expect(screen.getByTestId('lentille-list-mount')).toBeInTheDocument();
  });

  it("s'abonne au typing DÈS son montage, avec le currentUserId reçu", () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[]} />);
    expect(mockUseLentilleListTyping).toHaveBeenCalledWith('user-1');
  });

  it('rend un rang par conversation, réparti par section', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a'), conv('b')]}
      />
    );
    expect(screen.getAllByTestId('mock-lentille-row')).toHaveLength(2);
  });

  it('déclenche onSelectConversation au clic sur un rang', () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a')]} />);
    fireEvent.click(screen.getByTestId('mock-lentille-row'));
    expect(baseProps.onSelectConversation).toHaveBeenCalledTimes(1);
  });

  it('affiche le squelette UNIQUEMENT si le cache est vide (isLoading et zéro conversation)', () => {
    const { rerender } = render(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[]} isLoading={true} />
    );
    expect(screen.getByTestId('lentille-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-lentille-row')).not.toBeInTheDocument();

    rerender(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a')]} isLoading={true} />
    );
    expect(screen.queryByTestId('lentille-list-skeleton')).not.toBeInTheDocument();
  });

  it("n'affiche PAS le squelette une fois des conversations en cache, même si isLoading redevient true (pagination)", () => {
    render(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a')]} isLoading={true} />
    );
    expect(screen.queryByTestId('lentille-list-skeleton')).not.toBeInTheDocument();
  });

  it('masque le rail vivants quand aucune conversation live (section `live` absente)', () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a')]} />);
    expect(screen.queryByTestId('lentille-lives-rail')).not.toBeInTheDocument();
  });

  /**
   * WL-108 — l'élection est passée aux rangs, et elle est STABLE : c'est
   * cette stabilité qui garantit qu'aucun rang ne se re-rend parce que le
   * magasin de l'élu a « changé » (il ne change jamais d'identité ; seul son
   * contenu bouge, et chaque rang s'y abonne pour SON booléen).
   */
  it("transmet le magasin d'élection à chaque rang, avec une référence STABLE", () => {
    rowElections.length = 0;
    const { rerender } = render(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a'), conv('b')]} />
    );

    expect(rowElections).toHaveLength(2);
    expect(rowElections[0]).toBeDefined();
    // Les deux rangs partagent LE MÊME magasin — un élu global, pas un par rang.
    expect(rowElections[0]).toBe(rowElections[1]);

    const before = rowElections[0];
    rerender(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a'), conv('b')]} />
    );
    expect(rowElections[rowElections.length - 1]).toBe(before);
  });

  it('fonctionne sans currentUserId (garde défensive)', () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId={null} conversations={[]} />);
    expect(mockUseLentilleListTyping).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('lentille-list-mount')).toBeInTheDocument();
  });
});
