import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ForwardMessageModal } from '../../../components/conversations/forward-message-modal';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { conversationsService } from '@/services/conversations.service';
import { contactsDirectoryService, type DirectoryContact } from '@/services/contacts-directory.service';
import { useFriendRequestsV2 } from '@/hooks/v2/use-friend-requests-v2';
import type { Conversation, Message } from '@meeshy/shared/types';
import type { ForwardTarget } from '@/lib/forward-target-merge';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'forward.title': 'Transférer le message',
        'forward.search': 'Rechercher une conversation...',
        'forward.send-selected': `Envoyer (${params?.count ?? 0})`,
        'forward.sent': 'Message transféré',
        'forward.failed': 'Échec du transfert',
        'forward.send': 'Envoyer',
        'forward.close': 'Fermer',
        'forward.search-error': 'La recherche a échoué. Réessayez.',
      };
      return translations[key] || key;
    },
    locale: 'fr',
    setLocale: jest.fn(),
    isLoading: false,
    currentLanguage: 'fr',
    tArray: jest.fn(() => []),
  }),
}));

jest.mock('@/stores', () => ({
  useUser: jest.fn(() => ({ id: 'user-1', username: 'moi', displayName: 'Moi' })),
}));

// Mock la façade socket (le transport offline/fallback est couvert par elle)
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    sendMessage: jest.fn(() => Promise.resolve({ success: true, messageId: 'srv-1' })),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Anti-rebond neutralisé : les tests avancent au rythme des re-renders, pas
// d'un minuteur réel (même motif que UserPicker.test.tsx / AudienceUserPicker).
jest.mock('use-debounce', () => ({
  useDebounce: (value: unknown) => [value],
}));

jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({
  useFriendRequestsV2: jest.fn(),
}));

jest.mock('@/services/contacts-directory.service', () => ({
  contactsDirectoryService: { list: jest.fn() },
}));

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  // Les props sont transmises TELLES QUELLES : le mock qui n'en recopiait que
  // trois effaçait le `data-testid` de chaque champ, si bien que la feuille
  // n'avait qu'un seul nom pour tous ses champs. Le jour où un second champ est
  // apparu, les témoins se sont mis à viser « le textbox » et à en trouver deux.
  Input: ({ ...props }: any) => <input {...props} />,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar">{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

const mockSendMessage = meeshySocketIOService.sendMessage as jest.Mock;
const mockUseFriendRequestsV2 = useFriendRequestsV2 as jest.Mock;
const mockDirectoryList = contactsDirectoryService.list as jest.Mock;

// IntersectionObserver instrumenté — capture le callback pour piloter la
// sentinelle depuis les tests (même motif que ConversationMessagesModal dans
// UserDetailSections.test.tsx).
let capturedIOCallback: IntersectionObserverCallback | null = null;
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly scrollMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(cb: IntersectionObserverCallback) {
    capturedIOCallback = cb;
  }
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeAll(() => {
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIntersectionObserver;
});

const triggerIntersection = (element: Element) => {
  act(() => {
    capturedIOCallback?.(
      [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
};

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-target-1',
    title: 'Équipe produit',
    type: 'group',
    participants: [],
    isActive: true,
    memberCount: 3,
    status: 'active',
    visibility: 'private',
    ...overrides,
  }) as unknown as Conversation;

/**
 * Un DM n'a PAS de `title` côté gateway (« le frontend résout le nom de
 * l'interlocuteur ») — seul l'identifiant technique reste peuplé.
 */
const makeDirectConversation = (): Conversation =>
  ({
    id: 'conv-dm',
    title: null,
    identifier: 'mshy_direct-64f1a2b3c4d5e6f708192a3b-64f1a2b3c4d5e6f708192a3c-1755600000',
    type: 'direct',
    isActive: true,
    memberCount: 2,
    status: 'active',
    visibility: 'private',
    participants: [
      { id: 'part-1', userId: 'user-1', user: { id: 'user-1', displayName: 'Moi', username: 'moi' } },
      { id: 'part-2', userId: 'user-9', user: { id: 'user-9', displayName: 'Alice Martin', username: 'alicem' } },
    ],
  }) as unknown as Conversation;

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg-1',
    content: 'Hello world',
    conversationId: 'conv-src',
    originalLanguage: 'en',
    senderId: 'user-1',
    isViewOnce: false,
    ...overrides,
  }) as unknown as Message;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  message: makeMessage(),
  sourceConversationId: 'conv-src',
  conversations: [
    makeConversation({ id: 'conv-src', title: 'Conversation source' }),
    makeConversation({ id: 'conv-a', title: 'Équipe produit' }),
    makeConversation({ id: 'conv-b', title: 'Général', type: 'public' }),
    makeDirectConversation(),
  ],
};

const renderModal = (props: Record<string, unknown> = {}) =>
  render(<ForwardMessageModal {...defaultProps} {...props} />);

describe('ForwardMessageModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedIOCallback = null;
    mockSendMessage.mockResolvedValue({ success: true, messageId: 'srv-1' });
    mockUseFriendRequestsV2.mockReturnValue({ connected: [] });
    mockDirectoryList.mockResolvedValue({ contacts: [], hasMore: false });
    jest.spyOn(conversationsService, 'searchConversations').mockResolvedValue([]);
    jest.spyOn(conversationsService, 'createConversation').mockResolvedValue({ id: 'unused-conv' } as never);
  });

  it('rend la liste des conversations en excluant la conversation source', () => {
    renderModal();

    expect(screen.getByText('Équipe produit')).toBeInTheDocument();
    expect(screen.getByText('Général')).toBeInTheDocument();
    expect(screen.queryByText('Conversation source')).not.toBeInTheDocument();
  });

  it('filtre la liste par la recherche', () => {
    renderModal();

    fireEvent.change(screen.getByTestId('forward-search'), { target: { value: 'génér' } });

    expect(screen.getByText('Général')).toBeInTheDocument();
    expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
  });

  it("nomme une conversation directe par l'interlocuteur, jamais par son identifiant technique", () => {
    renderModal();

    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.queryByText(/mshy_direct-/)).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('forward-row-conv-dm')).getByTestId('avatar-fallback'),
    ).toHaveTextContent('A');
  });

  it("trouve une conversation directe en cherchant le nom de l'interlocuteur", () => {
    renderModal();

    fireEvent.change(screen.getByTestId('forward-search'), { target: { value: 'alice' } });

    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
  });

  it("l'envoi immédiat appelle la façade avec forwardedFromId et sans attachmentIds", async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-a',
      'Hello world',
      'en',
      undefined,
      undefined,
      undefined,
      undefined,
      expect.stringMatching(/^cid_/),
      'msg-1',
      'conv-src',
    );
  });

  it('une cible déjà envoyée n’est plus re-sélectionnable ni renvoyable', async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'sent');
    });

    fireEvent.click(screen.getByTestId('forward-row-conv-a'));
    expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'sent');
    expect(screen.queryByTestId('forward-send-selected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  it("le batch n'appelle la façade que pour les conversations sélectionnées", async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('forward-row-conv-a'));
    expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'selected');

    fireEvent.click(screen.getByTestId('forward-send-selected'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-a',
      'Hello world',
      'en',
      undefined,
      undefined,
      undefined,
      undefined,
      expect.stringMatching(/^cid_/),
      'msg-1',
      'conv-src',
    );
  });

  it('affiche la raison sous la ligne en cas d’échec et permet le retry', async () => {
    mockSendMessage.mockResolvedValueOnce({ success: false });
    renderModal();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'failed');
    });
    expect(screen.getByTestId('forward-failed-conv-a')).toBeInTheDocument();

    mockSendMessage.mockResolvedValueOnce({ success: true, messageId: 'srv-2' });
    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'sent');
    });
  });

  it('rejoue le MÊME clientMessageId au retry après un échec', async () => {
    mockSendMessage.mockResolvedValueOnce({ success: false });
    renderModal();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'failed');
    });
    const firstCid = mockSendMessage.mock.calls[0][7];
    expect(firstCid).toMatch(/^cid_/);

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    expect(mockSendMessage.mock.calls[1][7]).toBe(firstCid);
  });

  it('un nouvel envoi vers la même cible après un succès porte un clientMessageId différent', async () => {
    const { rerender } = render(<ForwardMessageModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(screen.getByTestId('forward-row-conv-a')).toHaveAttribute('data-state', 'sent');
    });
    const firstCid = mockSendMessage.mock.calls[0][7];

    rerender(<ForwardMessageModal {...defaultProps} isOpen={false} />);
    rerender(<ForwardMessageModal {...defaultProps} isOpen />);

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    expect(mockSendMessage.mock.calls[1][7]).toMatch(/^cid_/);
    expect(mockSendMessage.mock.calls[1][7]).not.toBe(firstCid);
  });

  // ==========================================================================
  // Task 11 : scroll infini, recherche unifiée, contact sans conversation
  // ==========================================================================

  it('charge la page suivante quand la sentinelle devient visible', async () => {
    const loadMore = jest.fn();
    renderModal({ hasMore: true, isLoadingMore: false, onLoadMore: loadMore });

    triggerIntersection(screen.getByTestId('forward-load-more-sentinel'));

    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
  });

  it('ne pagine pas pendant une recherche', async () => {
    const loadMore = jest.fn();
    renderModal({ hasMore: true, isLoadingMore: false, onLoadMore: loadMore });

    await userEvent.type(screen.getByTestId('forward-search'), 'alice');

    expect(screen.queryByTestId('forward-load-more-sentinel')).toBeNull();
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('crée la conversation directe à l’envoi, jamais à la sélection', async () => {
    const createConversation = jest.spyOn(conversationsService, 'createConversation')
      .mockResolvedValue({ id: 'new-conv' } as never);
    const contactsOverride: ForwardTarget[] = [
      { id: 'user:u1', kind: 'contact', userId: 'u1', title: 'Alice' },
    ];
    renderModal({ contactsOverride });

    await userEvent.click(screen.getByTestId('forward-row-user:u1'));
    expect(createConversation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('forward-send-user:u1'));
    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    expect(createConversation).toHaveBeenCalledWith({ type: 'direct', participantIds: ['u1'] });
    expect(mockSendMessage).toHaveBeenCalledWith(
      'new-conv',
      'Hello world',
      'en',
      undefined,
      undefined,
      undefined,
      undefined,
      expect.stringMatching(/^cid_/),
      'msg-1',
      'conv-src',
    );
  });

  it("distingue un échec réseau du carnet d'une recherche sans résultat", async () => {
    mockDirectoryList.mockRejectedValue(new Error('network down'));
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'zzzintrouvable');

    await waitFor(() => {
      expect(screen.getByTestId('forward-search-error')).toBeInTheDocument();
    });
  });

  it("n'affiche aucune erreur quand la recherche unifiée ne trouve simplement rien", async () => {
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'zzzintrouvable');

    await waitFor(() => expect(mockDirectoryList).toHaveBeenCalled());
    expect(screen.queryByTestId('forward-search-error')).toBeNull();
  });

  it('trouve un contact du carnet introuvable en conversation et envoie après création', async () => {
    mockDirectoryList.mockResolvedValue({
      contacts: [
        {
          id: 'd9',
          displayName: 'Bob Carnet',
          isOnMeeshy: true,
          matchedUser: { id: 'u42', username: 'bobc', displayName: 'Bob Carnet' },
        },
      ],
      hasMore: false,
    });
    const createConversation = jest.spyOn(conversationsService, 'createConversation')
      .mockResolvedValue({ id: 'conv-bob' } as never);
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'bob carnet');

    await waitFor(() => expect(screen.getByTestId('forward-row-user:u42')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('forward-send-user:u42'));

    await waitFor(() =>
      expect(createConversation).toHaveBeenCalledWith({ type: 'direct', participantIds: ['u42'] }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        'conv-bob',
        'Hello world',
        'en',
        undefined,
        undefined,
        undefined,
        undefined,
        expect.stringMatching(/^cid_/),
        'msg-1',
        'conv-src',
      ),
    );
  });

  // `GET /conversations/search` retourne DÉLIBÉRÉMENT les conversations
  // `public`/`global` dont l'appelant n'est pas membre (elle sert aussi la
  // recherche globale). Les offrir comme cible produit « Permissions
  // insuffisantes pour envoyer des messages » : une cible qui ne peut jamais
  // fonctionner. Depuis la décision du user (2026-08-19) la route n'émet AUCUN
  // participant pour un non-membre et déclare `isMember` — le seul signal.
  // Jumeau iOS : ForwardPickerViewModelTests
  // .test_search_dropsPublicRoomWhereUserIsNotAMember
  it("n'offre pas un salon public dont l'utilisateur n'est pas membre", async () => {
    jest.spyOn(conversationsService, 'searchConversations').mockResolvedValue([
      {
        id: 'conv-public-foreign',
        title: 'Photographie',
        type: 'public',
        isActive: true,
        isMember: false,
        participants: [],
      },
      {
        id: 'conv-public-joined',
        title: 'Photo perso',
        type: 'public',
        isActive: true,
        isMember: true,
        participants: [
          { id: 'p-x', userId: 'user-77', user: { id: 'user-77', displayName: 'Autre', username: 'autre' } },
          { id: 'p-me', userId: 'user-1', user: { id: 'user-1', displayName: 'Moi', username: 'moi' } },
        ],
      },
    ] as never);
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'photo');

    await waitFor(() =>
      expect(screen.getByTestId('forward-row-conv-public-joined')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('forward-row-conv-public-foreign')).toBeNull();
  });

  // LE faux négatif que le drapeau serveur supprime : `participants` est
  // tronqué à cinq par la route, donc dans un salon public de cinquante
  // personnes un membre légitime n'y figure pas — son PROPRE salon
  // disparaissait de sa recherche, en silence. Jumeau iOS :
  // .test_search_keepsPublicRoomFlaggedMember_evenWhenAbsentFromTheTruncatedParticipants
  it('offre un salon dont on est membre même quand on est absent des cinq participants émis', async () => {
    jest.spyOn(conversationsService, 'searchConversations').mockResolvedValue([
      {
        id: 'conv-public-big',
        title: 'Photo club',
        type: 'public',
        isActive: true,
        isMember: true,
        participants: ['u1', 'u2', 'u3', 'u4', 'u5'].map((uid) => ({
          id: `p-${uid}`,
          userId: uid,
          user: { id: uid, displayName: uid, username: uid },
        })),
      },
    ] as never);
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'photo');

    await waitFor(() =>
      expect(screen.getByTestId('forward-row-conv-public-big')).toBeInTheDocument(),
    );
  });

  // Repli rétro-compatible : face à un gateway qui ne porte pas encore le
  // drapeau, le web garde EXACTEMENT son comportement d'avant.
  it("sans drapeau serveur, retombe sur l'appartenance lue dans les participants", async () => {
    jest.spyOn(conversationsService, 'searchConversations').mockResolvedValue([
      {
        id: 'conv-legacy-foreign',
        title: 'Photographie',
        type: 'public',
        isActive: true,
        participants: [
          { id: 'p-x', userId: 'user-77', user: { id: 'user-77', displayName: 'Autre', username: 'autre' } },
        ],
      },
      {
        id: 'conv-legacy-joined',
        title: 'Photo perso',
        type: 'public',
        isActive: true,
        participants: [
          { id: 'p-me', userId: 'user-1', user: { id: 'user-1', displayName: 'Moi', username: 'moi' } },
        ],
      },
    ] as never);
    renderModal();

    await userEvent.type(screen.getByTestId('forward-search'), 'photo');

    await waitFor(() =>
      expect(screen.getByTestId('forward-row-conv-legacy-joined')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('forward-row-conv-legacy-foreign')).toBeNull();
  });

  it("rejette une réponse de recherche devenue périmée quand la requête redescend sous 2 caractères", async () => {
    let resolveDirectory: (value: { contacts: DirectoryContact[]; hasMore: boolean }) => void = () => {};
    mockDirectoryList.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDirectory = resolve;
        }),
    );
    renderModal();

    const input = screen.getByTestId('forward-search');
    // « alice » (5 caractères) déclenche une recherche distante — sa réponse
    // reste délibérément EN VOL (promesse contrôlée manuellement ci-dessus).
    await userEvent.type(input, 'alice');
    // La requête redescend sous le seuil de 2 caractères AVANT que la réponse
    // de « alice » n'arrive.
    await userEvent.clear(input);
    await userEvent.type(input, 'a');

    // La réponse tardive de « alice » arrive maintenant — un contact qui ne
    // correspond plus du tout à la recherche affichée (« a » seul). `act`
    // async + un macrotask garantissent que TOUTES les microtâches de
    // résolution (`Promise.allSettled` puis son `.then`) sont écoulées avant
    // l'assertion — un simple `waitFor` sur un fait déjà vrai (l'appel a déjà
    // eu lieu pendant la frappe) ne l'aurait pas garanti.
    await act(async () => {
      resolveDirectory({
        contacts: [
          {
            id: 'd-stale',
            displayName: 'Alice Périmée',
            isOnMeeshy: true,
            matchedUser: { id: 'u-stale', username: 'aliceperime' },
          },
        ],
        hasMore: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByTestId('forward-row-user:u-stale')).toBeNull();
  });
});
