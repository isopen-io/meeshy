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

/**
 * Capture par IDENTIFIANT de rang, jamais par ordre d'appel : depuis le
 * correctif REV-4/B1, le point de montage publie son conteneur de défilement
 * par une ref PAR CALLBACK — donc un rendu de publication s'ajoute au montage,
 * et compter les appels de rendu compterait des passes, pas des rangs. Ce que
 * ces témoins vérifient (« chaque rang reçoit le MÊME magasin », « chaque rang
 * reçoit `onShowDetails` ») ne dépend pas du nombre de passes.
 */
const rowElections = new Map<string, unknown>();
const rowShowDetails = new Map<string, unknown>();
jest.mock('../LentilleRow', () => ({
  LentilleRow: ({ conversation, onSelect, election, onShowDetails }: any) => {
    rowElections.set(conversation.id, election);
    rowShowDetails.set(conversation.id, onShowDetails);
    return (
      <div data-testid="mock-lentille-row" data-id={conversation.id} onClick={() => onSelect(conversation)}>
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
    rowElections.clear();
    const { rerender } = render(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a'), conv('b')]} />
    );

    expect([...rowElections.keys()].sort()).toEqual(['a', 'b']);
    expect(rowElections.get('a')).toBeDefined();
    // Les deux rangs partagent LE MÊME magasin — un élu global, pas un par rang.
    expect(rowElections.get('a')).toBe(rowElections.get('b'));

    const before = rowElections.get('a');
    rerender(
      <LentilleConversationListMount {...baseProps} currentUserId="user-1" conversations={[conv('a'), conv('b')]} />
    );
    expect(rowElections.get('a')).toBe(before);
    expect(rowElections.get('b')).toBe(before);
  });

  /**
   * REV-4/B3 — « réglages » est l'une des six actions historiques du ⋮ ; elle
   * est la seule à devoir remonter jusqu'à l'appelant du mux. Si le point de
   * montage ne la transmet pas, l'entrée existe mais ne fait rien.
   */
  it("transmet `onShowDetails` à chaque rang (behaviour-matrix:L07)", () => {
    rowShowDetails.clear();
    const onShowDetails = jest.fn();
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a'), conv('b')]}
        onShowDetails={onShowDetails}
      />
    );
    expect([...rowShowDetails.keys()].sort()).toEqual(['a', 'b']);
    expect([...rowShowDetails.values()].every((fn) => fn === onShowDetails)).toBe(true);
  });

  it('fonctionne sans currentUserId (garde défensive)', () => {
    render(<LentilleConversationListMount {...baseProps} currentUserId={null} conversations={[]} />);
    expect(mockUseLentilleListTyping).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('lentille-list-mount')).toBeInTheDocument();
  });
});

/**
 * REV-4/B2 — behaviour-matrix:L17.
 *
 * Verdict de la porte V2 : « drapeau ON ⇒ pagination (sentinelle
 * IntersectionObserver) et branches vides perdues — le Mount remplace
 * `renderContent` en bloc ». Ces témoins verrouillent le retour des DEUX,
 * par RÉUTILISATION des mécanismes historiques :
 *   - `EmptyConversations` (`conversation-groups/`) — le MÊME composant que
 *     le chemin historique, avec la MÊME distinction « recherche vide » vs
 *     « aucune conversation » ;
 *   - `ConversationListLoadMore` (`conversation-groups/`) — le bouton
 *     « Charger plus », son indicateur de chargement et la CIBLE de la
 *     sentinelle, tous trois extraits de `renderContent` (marquage inchangé
 *     au caractère près, snapshot OFF oblige) pour servir les deux chemins ;
 *     l'observateur reste unique, chez `ConversationList`
 *     (`useLoadMoreSentinel`), et sa ref est simplement transmise ici.
 *
 * La sentinelle ne porte AUCUN attribut de test (le chemin OFF doit rester
 * bit-à-bit identique) : ce qui est vérifié est ce qui compte réellement —
 * le ref-setter de l'observateur unique reçoit bien un élément réel.
 *
 * Le squelette (déjà présent avant B2) reste couvert plus haut ; il fait
 * partie du même id L17 et n'a jamais manqué.
 */
function sentinelElements(ref: jest.Mock): HTMLElement[] {
  return ref.mock.calls.map(([el]) => el).filter((el): el is HTMLElement => el instanceof HTMLElement);
}

describe('LentilleConversationListMount — pagination et branches vides (B2, behaviour-matrix:L17)', () => {
  it('rend la branche vide historique quand aucune conversation ne subsiste (hors chargement)', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[]}
        searchQuery=""
      />
    );
    expect(screen.getByText('noConversations')).toBeInTheDocument();
  });

  it('distingue « recherche sans résultat » de « aucune conversation » (même règle que le chemin historique)', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[]}
        searchQuery="zzz"
      />
    );
    expect(screen.getByText('conversationSearch.noConversationsFound')).toBeInTheDocument();
    expect(screen.queryByText('noConversations')).not.toBeInTheDocument();
  });

  it('ne rend PAS la branche vide pendant le chargement initial (le squelette la précède)', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[]}
        isLoading={true}
        searchQuery=""
      />
    );
    expect(screen.getByTestId('lentille-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('noConversations')).not.toBeInTheDocument();
  });

  it('ne rend PAS la branche vide quand des conversations existent', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a')]}
        searchQuery=""
      />
    );
    expect(screen.queryByText('noConversations')).not.toBeInTheDocument();
  });

  it('rend le bouton « Charger plus » ET la cible de sentinelle quand il reste des pages', () => {
    const sentinelRef = jest.fn();
    const onLoadMore = jest.fn();

    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a')]}
        searchQuery=""
        hasMore
        isLoadingMore={false}
        onLoadMore={onLoadMore}
        loadMoreSentinelRef={sentinelRef}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'loadMore' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // La sentinelle est bien la cible de l'observateur unique du parent :
    // le ref-setter reçu a été appelé avec un élément réel.
    expect(sentinelElements(sentinelRef)).toHaveLength(1);
  });

  it('masque la cible de sentinelle pendant un chargement de page (jamais deux pages en vol)', () => {
    const sentinelRef = jest.fn();

    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a')]}
        searchQuery=""
        hasMore
        isLoadingMore
        onLoadMore={jest.fn()}
        loadMoreSentinelRef={sentinelRef}
      />
    );

    expect(sentinelElements(sentinelRef)).toHaveLength(0);
    expect(screen.getByText('loadingMore')).toBeInTheDocument();
  });

  it('ne rend ni bouton ni sentinelle quand il ne reste plus de page', () => {
    const sentinelRef = jest.fn();

    render(
      <LentilleConversationListMount
        {...baseProps}
        currentUserId="user-1"
        conversations={[conv('a')]}
        searchQuery=""
        hasMore={false}
        onLoadMore={jest.fn()}
        loadMoreSentinelRef={sentinelRef}
      />
    );

    expect(screen.queryByRole('button', { name: 'loadMore' })).not.toBeInTheDocument();
    expect(sentinelElements(sentinelRef)).toHaveLength(0);
  });
});
