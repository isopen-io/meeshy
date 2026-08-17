/**
 * WL-101 (LWS-10) — comportement du mux Lentille dans ConversationList.
 *
 * Trois preuves distinctes de la garde structurelle
 * (`ConversationList.lentille-dynamic-structure.test.ts`) :
 *   1. Drapeau OFF (défaut) ⇒ le point de montage Lentille n'est jamais
 *      monté ; le rendu historique reste seul visible.
 *   2. Drapeau ON, sans exception ⇒ le point de montage Lentille est monté,
 *      à la place du rendu historique.
 *   3. Drapeau ON, la sous-arborescence Lentille LÈVE une exception ⇒
 *      `FeatureErrorBoundary` retombe sur EXACTEMENT le rendu historique
 *      (contenu des conversations visible), jamais sur l'UI de repli
 *      générique de `FeatureErrorBoundary` (pas de page morte).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationList } from '../../../components/conversations/ConversationList';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

// ---- Contrôle du drapeau (mux) ----------------------------------------
let mockLentilleActive = false;

jest.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({
    isFeatureEnabled: (feature: string) => (feature === 'lentille_list' ? mockLentilleActive : false),
  }),
}));

// ---- Contrôle du comportement du point de montage Lentille -------------
let mockLentilleShouldThrow = false;

// REV-4/B2 — le double du point de montage expose désormais CE QU'IL REÇOIT du
// mux en matière de pagination et de branche vide : c'est exactement ce que le
// verdict de la porte V2 a trouvé manquant (« le Mount remplace `renderContent`
// en bloc »). Le comportement de rendu de ces props est couvert par la suite du
// composant réel (`LentilleConversationListMount.test.tsx`).
jest.mock('@/components/conversations/lentille/LentilleConversationListMount', () => ({
  LentilleConversationListMount: ({
    currentUserId,
    searchQuery,
    hasMore,
    isLoadingMore,
    onLoadMore,
    loadMoreSentinelRef,
  }: {
    currentUserId: string | null | undefined;
    searchQuery?: string;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
    loadMoreSentinelRef?: (el: HTMLDivElement | null) => void;
  }) => {
    if (mockLentilleShouldThrow) {
      throw new Error('[test] échec injecté dans la sous-arborescence Lentille');
    }
    return (
      <div
        data-testid="lentille-list-mount"
        data-current-user-id={currentUserId ?? ''}
        data-search-query={searchQuery ?? ''}
        data-has-more={String(hasMore ?? false)}
        data-is-loading-more={String(isLoadingMore ?? false)}
        data-has-load-more={String(typeof onLoadMore === 'function')}
      >
        {hasMore && !isLoadingMore && (
          <div ref={loadMoreSentinelRef} data-testid="lentille-load-more-sentinel" />
        )}
      </div>
    );
  },
}));

// ---- next/dynamic résolu de façon synchrone pour les tests --------------
// Même idiome que __tests__/components/conversations/ConversationLayout.test.tsx :
// évite les problèmes de chargement asynchrone pendant les assertions.
jest.mock('next/dynamic', () => {
  return function dynamic(importFn: () => Promise<any>) {
    const cache: { component: React.ComponentType<any> | null } = { component: null };

    importFn().then((mod: any) => {
      cache.component = mod.default || Object.values(mod)[0] || mod;
    });

    const DynamicWrapper = (props: any) => {
      if (cache.component) {
        const Comp = cache.component;
        return <Comp {...props} />;
      }
      return null;
    };

    DynamicWrapper.displayName = 'DynamicComponent';
    return DynamicWrapper;
  };
});

// ---- Mocks de service/store, repris de ConversationList.test.tsx --------
jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: jest.fn(),
    getCategories: jest.fn(),
    togglePin: jest.fn(),
    toggleMute: jest.fn(),
    toggleArchive: jest.fn(),
    updateReaction: jest.fn(),
  },
}));

jest.mock('@/stores/conversation-preferences-store', () => ({
  useConversationPreferencesStore: jest.fn((selector: any) => {
    const state = {
      preferencesMap: new Map(),
      categories: [],
      isLoading: false,
      isInitialized: true,
      initialize: jest.fn(),
      togglePin: jest.fn(),
      toggleMute: jest.fn(),
      toggleArchive: jest.fn(),
    };
    return selector ? selector(state) : state;
  }),
  useConversationPreference: (_id: string) => undefined,
  useConversationCategories: () => [],
  useConversationPreferencesActions: () => ({
    initialize: jest.fn(),
    getPreferences: jest.fn(),
    togglePin: jest.fn(),
    toggleMute: jest.fn(),
    toggleArchive: jest.fn(),
    setReaction: jest.fn(),
    refreshPreferences: jest.fn(),
  }),
}));

jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn(() => ({
    getUserById: jest.fn(),
    _lastStatusUpdate: 0,
  })),
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-prefetch-on-hover', () => ({
  usePrefetchOnHover: () => ({
    onMouseEnter: jest.fn(),
    onMouseLeave: jest.fn(),
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, title }: any) => (
    <button onClick={onClick} className={className} title={title}>{children}</button>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => <div data-testid="avatar" className={className}>{children}</div>,
  AvatarFallback: ({ children, className }: any) => <div data-testid="avatar-fallback" className={className}>{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span data-testid="badge" className={className}>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input data-testid="search-input" {...props} />,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: React.forwardRef(({ children }: any, ref: any) => <div ref={ref}>{children}</div>),
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status }: any) => (
    <div data-testid="online-indicator" data-online={isOnline} data-status={status} />
  ),
}));

jest.mock('../../../components/conversations/create-link-button', () => ({
  CreateLinkButton: ({ children }: any) => <button data-testid="create-link-button">{children}</button>,
}));

jest.mock('../../../components/conversations/CommunityCarousel', () => ({
  CommunityCarousel: ({ onFilterChange }: any) => (
    <div data-testid="community-carousel">
      <button onClick={() => onFilterChange({ type: 'all' })}>All</button>
    </div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/utils/tag-colors', () => ({
  getTagColor: () => ({ bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }),
}));

jest.mock('@/lib/user-status', () => ({
  getUserStatus: jest.fn(() => 'online'),
}));

jest.mock('@/utils/date-format', () => ({
  formatConversationDate: () => 'Today',
  formatRelativeDate: () => '2 days ago',
}));

const mockCurrentUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: 'USER',
  email: 'test@example.com',
} as User;

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Test Conversation 1',
    type: 'group',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: {
      id: 'msg-1',
      content: 'Hello world',
      createdAt: new Date().toISOString(),
      sender: { id: 'user-2', username: 'john', displayName: 'John' },
    },
    unreadCount: 2,
  } as any,
];

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    title: 'Conversations',
    createNewConversation: 'New Conversation',
    loadingConversations: 'Loading conversations...',
    'conversationSearch.noConversationsFound': 'No conversations found',
    noConversations: 'No conversations yet',
    'conversationsList.pinned': 'Pinned',
    'conversationsList.uncategorized': 'Uncategorized',
    'conversationHeader.share': 'Share',
    loadingMore: 'Loading more...',
  };
  return translations[key] || key;
};

const mockTSearch = (key: string) => (key === 'placeholder' ? 'Search conversations...' : key);

describe('ConversationList — mux Lentille (WL-101)', () => {
  const defaultProps = {
    conversations: mockConversations,
    selectedConversation: null as Conversation | null,
    currentUser: mockCurrentUser,
    isLoading: false,
    isMobile: false,
    showConversationList: true,
    onSelectConversation: jest.fn(),
    onShowDetails: jest.fn(),
    onCreateConversation: jest.fn(),
    onLinkCreated: jest.fn(),
    t: mockT,
    tSearch: mockTSearch,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLentilleActive = false;
    mockLentilleShouldThrow = false;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('drapeau OFF (défaut)', () => {
    it('ne monte jamais le point de montage Lentille', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('lentille-list-mount')).not.toBeInTheDocument();
    });

    // R20/R8 — « drapeau OFF ⇒ snapshot identique ». Ce snapshot fige le
    // rendu de la zone de contenu scrollable AVANT/APRÈS le diff WL-101 :
    // le mux ajouté par ce diff ne doit rien changer au marquage historique
    // quand le drapeau est éteint. Toute divergence future de ce fichier
    // `.snap` est le signal exact que le chemin OFF a bougé.
    it('rend un contenu scrollable bit-à-bit stable (snapshot de référence)', async () => {
      const { container } = render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      });

      const scrollableContent = container.querySelector('.overflow-y-auto');
      expect(scrollableContent).toMatchSnapshot();
    });
  });

  describe('drapeau ON, sans exception', () => {
    it('monte le point de montage Lentille à la place du rendu historique', async () => {
      mockLentilleActive = true;

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('lentille-list-mount')).toBeInTheDocument();
      });

      expect(screen.getByTestId('lentille-list-mount')).toHaveAttribute(
        'data-current-user-id',
        'user-1'
      );
      expect(screen.queryByText('Test Conversation 1')).not.toBeInTheDocument();
    });
  });

  /**
   * REV-4/B2 — behaviour-matrix:L17.
   *
   * Le mux ne doit plus AMPUTER le chemin Lentille de ce que `renderContent`
   * portait : la pagination et la branche vide sont des propriétés de la
   * LISTE, pas de sa peau. Le mécanisme reste unique (`useLoadMoreSentinel`
   * chez `ConversationList`) ; seul son ref-setter descend.
   */
  describe('drapeau ON — pagination et branche vide transmises (B2)', () => {
    beforeEach(() => {
      mockLentilleActive = true;
    });

    it('transmet hasMore / isLoadingMore / onLoadMore au point de montage', async () => {
      render(
        <ConversationList
          {...defaultProps}
          hasMore={true}
          isLoadingMore={false}
          onLoadMore={jest.fn()}
        />
      );

      const mount = await screen.findByTestId('lentille-list-mount');
      expect(mount).toHaveAttribute('data-has-more', 'true');
      expect(mount).toHaveAttribute('data-is-loading-more', 'false');
      expect(mount).toHaveAttribute('data-has-load-more', 'true');
    });

    it('transmet la requête de recherche courante (la branche vide doit pouvoir la distinguer)', async () => {
      render(<ConversationList {...defaultProps} />);
      const mount = await screen.findByTestId('lentille-list-mount');
      expect(mount).toHaveAttribute('data-search-query', '');
    });

    it("observe la sentinelle rendue par le point de montage — l'observateur unique du parent la voit", async () => {
      const observed: Element[] = [];
      const originalObserver = global.IntersectionObserver;
      // @ts-expect-error -- double de test, borné à ce cas
      global.IntersectionObserver = class {
        constructor(_cb: unknown, _opts: unknown) {}
        observe(el: Element) { observed.push(el); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };

      try {
        render(
          <ConversationList
            {...defaultProps}
            hasMore={true}
            isLoadingMore={false}
            onLoadMore={jest.fn()}
          />
        );

        const sentinel = await screen.findByTestId('lentille-load-more-sentinel');
        await waitFor(() => {
          expect(observed).toContain(sentinel);
        });
      } finally {
        global.IntersectionObserver = originalObserver;
      }
    });
  });

  describe('drapeau ON, la sous-arborescence Lentille lève une exception', () => {
    it('retombe sur EXACTEMENT le rendu historique — jamais une page morte', async () => {
      mockLentilleActive = true;
      mockLentilleShouldThrow = true;

      render(<ConversationList {...defaultProps} />);

      // Le rendu historique (liste réelle) doit apparaître...
      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      });

      // ...et PAS l'UI de repli générique de FeatureErrorBoundary (qui
      // afficherait un message d'erreur et un bouton « réessayer » —
      // signe d'une page morte, pas de la liste d'aujourd'hui).
      expect(screen.queryByText(/errorBoundary/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('lentille-list-mount')).not.toBeInTheDocument();

      // Toujours pas de crash de l'ARBRE ENTIER : le header et la recherche
      // restent visibles, preuve que l'exception est restée confinée.
      expect(screen.getByText('Conversations')).toBeInTheDocument();
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });
  });
});
