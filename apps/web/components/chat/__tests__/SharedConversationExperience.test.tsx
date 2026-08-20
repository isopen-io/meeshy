import { createElement, useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SharedConversationExperience } from '../SharedConversationExperience';
import type { LinkConversationData } from '@/services/link-conversation.service';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key, isLoading: false }),
}));

// `getSharedAccessData` : la charge complète quand la lecture est permise, les
// métadonnées publiques du lien sinon. C'est ce que l'écran demande — la
// distinction entre les deux sources vit dans le service, pas ici.
const mockGetConversationData = jest.fn();
jest.mock('@/services/link-conversation.service', () => ({
  LinkConversationService: {
    getSharedAccessData: (...args: unknown[]) => mockGetConversationData(...args),
  },
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAnonymousSession: () => null,
    getAuthToken: () => null,
  },
}));

jest.mock('@/hooks/use-anonymous-session', () => ({
  useAnonymousSession: jest.fn(),
}));

jest.mock('@/components/conversations/ConversationLayout', () => ({
  ConversationLayout: ({ selectedConversationId }: { selectedConversationId?: string }) => (
    <div data-testid="app-conversation-view" data-conversation-id={selectedConversationId} />
  ),
}));

jest.mock('@/components/common/bubble-stream-page', () => ({
  BubbleStreamPage: ({
    conversationId,
    variant,
    conversationTitle,
    attachmentPermissions,
  }: {
    conversationId?: string;
    variant?: string;
    conversationTitle?: string;
    attachmentPermissions?: { canSendImages: boolean; canSendFiles: boolean };
  }) => (
    <div
      data-testid="live-shared-view"
      data-conversation-id={conversationId}
      data-variant={variant}
      data-title={conversationTitle}
      data-attachment-permissions={
        attachmentPermissions ? JSON.stringify(attachmentPermissions) : undefined
      }
    />
  ),
}));

jest.mock('../SharedConversationPreview', () => ({
  SharedConversationPreview: () => <div data-testid="shared-preview" />,
}));

jest.mock('../JoinConversationModal', () => ({
  JoinConversationModal: ({ open, identity }: { open: boolean; identity: string }) =>
    open ? <div data-testid="join-modal" data-identity={identity} /> : null,
}));

jest.mock('@/components/join', () => ({
  JoinError: ({ error }: { error: string }) => <div data-testid="join-error">{error}</div>,
  AnonymousForm: () => null,
}));

// `next/dynamic` est résolu de façon synchrone en test : les mocks de module
// ci-dessus restent l'implémentation servie.
jest.mock('next/dynamic', () => (loader: () => Promise<unknown>) => {
  const LazyComponent = (props: Record<string, unknown>) => {
    const [Resolved, setResolved] = useState<unknown>(null);
    useEffect(() => {
      let alive = true;
      void Promise.resolve(loader()).then((mod: unknown) => {
        if (alive) setResolved(() => mod);
      });
      return () => { alive = false; };
    }, []);
    return Resolved ? createElement(Resolved as never, props) : null;
  };
  return LazyComponent;
});

jest.mock('@/utils/participant-mapper', () => ({
  mapCurrentUserToUser: (user: unknown) => user,
  mapParticipantsFromLinkData: () => [],
}));

const CONVERSATION_ID = '507f1f77bcf86cd799439022';

function makeLinkData(overrides: Partial<LinkConversationData> = {}): LinkConversationData {
  return {
    conversation: {
      id: CONVERSATION_ID,
      title: 'Week-end Ardèche',
      description: '',
      type: 'group',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    link: {
      id: '507f1f77bcf86cd799439099',
      linkId: 'mshy_abc_123',
      name: 'Ardèche',
      description: '',
      allowViewHistory: true,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      requireAccount: false,
      requireEmail: false,
      requireNickname: true,
      requireBirthday: false,
      expiresAt: null,
      isActive: true,
    },
    userType: 'anonymous',
    messages: [],
    stats: { totalMessages: 0, totalMembers: 1, hasMore: false },
    members: [],
    anonymousParticipants: [],
    currentUser: null,
    ...overrides,
  } as LinkConversationData;
}

beforeEach(() => {
  mockGetConversationData.mockReset();
});

describe('SharedConversationExperience — un écran, trois rendus', () => {
  // « ça charge le chat associé DANS LA VUE ACTUELLE » : pour un membre, c'est
  // littéralement la vue applicative de /conversations/:id, responsive.
  it('drops a member straight into the full app conversation view', async () => {
    mockGetConversationData.mockResolvedValue(makeLinkData({ userType: 'member' }));

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    const view = await screen.findByTestId('app-conversation-view');
    expect(view).toHaveAttribute('data-conversation-id', CONVERSATION_ID);
    expect(screen.queryByTestId('join-modal')).not.toBeInTheDocument();
  });

  it('gives a joined anonymous participant the live shared view', async () => {
    mockGetConversationData.mockResolvedValue(
      makeLinkData({
        currentUser: {
          id: 'anon-1',
          username: 'guest',
          firstName: 'Guest',
          lastName: 'One',
          language: 'fr',
          isMeeshyer: false,
        },
      })
    );

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    const view = await screen.findByTestId('live-shared-view');
    expect(view).toHaveAttribute('data-conversation-id', CONVERSATION_ID);
    expect(screen.queryByTestId('join-modal')).not.toBeInTheDocument();

    // La variante `thread` : géométrie de messagerie (récent en bas), en-tête
    // d'identité alimenté par le titre de la conversation, Lentille des modes.
    expect(view).toHaveAttribute('data-variant', 'thread');
    expect(view).toHaveAttribute('data-title', 'Week-end Ardèche');

    // Le wrapper hauteur-viewport est ce qui FIGE le composer en bas : sans
    // lui, `h-full` s'effondre et toute la page défile.
    expect(view.closest('.h-\\[100dvh\\]')).not.toBeNull();
  });

  // Un invité anonyme avec droits asymétriques : images OUI, fichiers NON.
  // Le mapper vérifié est le passage des deux booléens du lien jusqu'à
  // `BubbleStreamPage` (couvert par message-composer.test.tsx pour les
  // conséquences visuelles). Ici on vérifie que `allowAnonymousImages` →
  // `canSendImages` et `allowAnonymousFiles` → `canSendFiles` — une inversion
  // ferait échouer ce test asymétrique contrairement à une fixture symétrique.
  it('threads the link attachment rights to the live shared view as booleans', async () => {
    mockGetConversationData.mockResolvedValue(
      makeLinkData({
        link: {
          ...makeLinkData().link,
          allowAnonymousFiles: false,
          allowAnonymousImages: true,
        },
        currentUser: {
          id: 'anon-1',
          username: 'guest',
          firstName: 'Guest',
          lastName: 'One',
          language: 'fr',
          isMeeshyer: false,
        },
      })
    );

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    const view = await screen.findByTestId('live-shared-view');
    expect(view).toHaveAttribute(
      'data-attachment-permissions',
      JSON.stringify({ canSendImages: true, canSendFiles: false })
    );
  });

  it('shows a visitor the preview with the join modal on top', async () => {
    mockGetConversationData.mockResolvedValue(makeLinkData());

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    expect(await screen.findByTestId('shared-preview')).toBeInTheDocument();
    expect(screen.getByTestId('join-modal')).toHaveAttribute('data-identity', 'none');
  });

  it('tells the modal when the visitor is a signed-in non-member', async () => {
    mockGetConversationData.mockResolvedValue(
      makeLinkData({
        currentUser: {
          id: 'user-9',
          username: 'bob',
          firstName: 'Bob',
          lastName: 'Jones',
          language: 'en',
          isMeeshyer: true,
        },
      })
    );

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    expect(await screen.findByTestId('join-modal')).toHaveAttribute('data-identity', 'registered');
  });
});

describe('SharedConversationExperience — liens morts', () => {
  it('reports an expired link', async () => {
    const data = makeLinkData();
    mockGetConversationData.mockResolvedValue({
      ...data,
      link: { ...data.link, expiresAt: '2020-01-01T00:00:00.000Z' },
    });

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    expect(await screen.findByTestId('join-error')).toHaveTextContent('errors.linkExpired');
  });

  it('reports a deactivated link', async () => {
    const data = makeLinkData();
    mockGetConversationData.mockResolvedValue({
      ...data,
      link: { ...data.link, isActive: false },
    });

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    expect(await screen.findByTestId('join-error')).toHaveTextContent('errors.linkNoLongerActive');
  });

  it('reports a link the server refuses to resolve', async () => {
    mockGetConversationData.mockRejectedValue(new Error('HTTP 403'));

    render(<SharedConversationExperience linkId="mshy_abc_123" />);

    expect(await screen.findByTestId('join-error')).toHaveTextContent('errors.invalidLink');
  });
});

describe('SharedConversationExperience — pas de navigation', () => {
  // La régression que cette livraison supprime : /chat renvoyait sur /join, qui
  // renvoyait sur /chat. Aucun des trois rendus ne doit naviguer.
  it('never navigates away, whatever the visitor’s identity', async () => {
    mockGetConversationData.mockResolvedValue(makeLinkData());
    const assignSpy = jest.spyOn(window.history, 'replaceState');

    render(<SharedConversationExperience linkId="mshy_abc_123" />);
    await screen.findByTestId('shared-preview');

    await waitFor(() => expect(mockGetConversationData).toHaveBeenCalledTimes(1));
    expect(assignSpy).not.toHaveBeenCalled();

    assignSpy.mockRestore();
  });
});
