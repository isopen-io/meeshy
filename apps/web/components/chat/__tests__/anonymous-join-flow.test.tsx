/**
 * Le parcours ANONYME de bout en bout, sans mocker les maillons du milieu.
 *
 * Les deux suites voisines vérifient chacune un maillon isolé
 * (`SharedConversationExperience` avec le service mocké, `JoinConversationModal`
 * avec le hook de jonction mocké). Le lien partagé cassait précisément ENTRE
 * les deux : la seule chose mockée ici est `fetch` — le réseau. Tout le reste
 * (résolution du lien, décision de rendu, modale, formulaire, POST de jonction)
 * est le code de production.
 */
import { createElement, useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SharedConversationExperience } from '../SharedConversationExperience';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key, isLoading: false }),
}));

jest.mock('@/components/conversations/ConversationLayout', () => ({
  ConversationLayout: () => <div data-testid="app-conversation-view" />,
}));

jest.mock('@/components/common/bubble-stream-page', () => ({
  BubbleStreamPage: () => <div data-testid="live-shared-view" />,
}));

jest.mock('../SharedConversationPreview', () => ({
  SharedConversationPreview: () => <div data-testid="shared-preview" />,
}));

jest.mock('@/hooks/use-anonymous-session', () => ({
  useAnonymousSession: jest.fn(),
}));

jest.mock('@/components/auth/login-form', () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

jest.mock('@/components/auth/register-form', () => ({
  RegisterForm: () => <div data-testid="register-form" />,
}));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: LINK_ID }),
  usePathname: () => `/chat/${LINK_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

// `next/dynamic` est résolu de façon synchrone en test.
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

const LINK_ID = '507f1f77bcf86cd799439099.2608171200_ab12cd34';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439099';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';

type LinkOverrides = Record<string, unknown>;

function linkPayload(overrides: LinkOverrides = {}) {
  return {
    id: SHARE_LINK_DB_ID,
    linkId: LINK_ID,
    name: 'Ardèche',
    description: '',
    allowViewHistory: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: true,
    requireAccount: false,
    requireEmail: false,
    requireNickname: false,
    requireBirthday: false,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

function conversationPayload() {
  return {
    id: CONVERSATION_ID,
    title: 'Week-end Ardèche',
    description: '',
    type: 'group',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

/**
 * Le réseau tel que la gateway le sert réellement :
 *   GET  /api/v1/links/:identifier        → payload complet, 403 si l'historique est privé
 *   GET  /api/v1/anonymous/link/:id       → métadonnées publiques du lien
 *   GET  /api/v1/auth/check-availability  → disponibilité du pseudo
 *   POST /api/v1/anonymous/join/:linkId   → création de la session anonyme
 */
function installGateway({ linkOverrides = {} }: { linkOverrides?: LinkOverrides } = {}) {
  const joinRequests: Array<{ url: string; body: any }> = [];
  const link = linkPayload(linkOverrides);
  const historyIsPrivate = link.allowViewHistory === false;

  const fetchMock = jest.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input);

    if (url.includes('/anonymous/join/')) {
      joinRequests.push({ url, body: JSON.parse(init.body) });
      return jsonResponse(201, {
        success: true,
        data: {
          sessionToken: 'anon_1755000000000_deadbeef_1234',
          participant: {
            id: 'part-anon-1',
            username: 'jean_dupont042',
            displayName: 'jean_dupont042',
            firstName: 'Jean',
            lastName: 'Dupont',
            language: 'fr',
            isMeeshyer: false,
            canSendMessages: true,
            canSendFiles: false,
            canSendImages: true,
          },
          conversation: { id: CONVERSATION_ID, title: 'Week-end Ardèche', type: 'group', allowViewHistory: link.allowViewHistory },
          linkId: LINK_ID,
          id: SHARE_LINK_DB_ID,
        },
      });
    }

    if (url.includes('/auth/check-availability')) {
      return jsonResponse(200, { success: true, data: { usernameAvailable: true } });
    }

    if (url.includes('/anonymous/link/')) {
      return jsonResponse(200, {
        success: true,
        data: {
          ...link,
          conversation: conversationPayload(),
          creator: { id: 'user-1', username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', avatar: null },
          stats: { totalParticipants: 3, memberCount: 2, anonymousCount: 1, languageCount: 2, spokenLanguages: ['fr', 'en'] },
        },
      });
    }

    if (url.includes('/links/')) {
      // Un lien qui n'expose pas son historique refuse la charge complète.
      if (historyIsPrivate) {
        return jsonResponse(403, { success: false, error: 'Accès non autorisé à ce lien', message: 'Accès non autorisé à ce lien' });
      }
      return jsonResponse(200, {
        success: true,
        data: {
          conversation: conversationPayload(),
          link,
          userType: 'anonymous',
          messages: [],
          stats: { totalMessages: 0, totalMembers: 2, hasMore: false },
          members: [],
          anonymousParticipants: [],
          currentUser: null,
        },
      });
    }

    throw new Error(`Appel réseau inattendu: ${url}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return { joinRequests, fetchMock };
}

beforeEach(() => {
  localStorage.clear();
  mockRouter.push.mockReset();
});

describe('Jonction anonyme — le lien partagé mène jusqu’à la session', () => {
  it('ouvre la modale de jonction pour un visiteur sans compte', async () => {
    installGateway();

    render(<SharedConversationExperience linkId={LINK_ID} />);

    expect(await screen.findByRole('dialog')).toHaveTextContent('Week-end Ardèche');
  });

  it('crée la session anonyme depuis la modale', async () => {
    const { joinRequests } = installGateway();

    render(<SharedConversationExperience linkId={LINK_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: /joinAnonymously/ }));
    await userEvent.type(screen.getByLabelText(/firstName/), 'Jean');
    await userEvent.type(screen.getByLabelText(/lastName/), 'Dupont');

    // Le pseudo est généré puis vérifié en différé : le bouton reste désarmé
    // tant que la vérification court.
    const submit = screen.getByRole('button', { name: /^join$/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    await waitFor(() => expect(joinRequests).toHaveLength(1));
    expect(joinRequests[0].url).toContain(`/anonymous/join/${LINK_ID}`);
    expect(joinRequests[0].body).toMatchObject({ firstName: 'Jean', lastName: 'Dupont' });
  });

  // LE bug : `allowViewHistory: false` ne dit RIEN sur le droit de rejoindre —
  // il cache l'historique. La gateway refuse la charge complète (403) ; le
  // client en concluait « lien invalide » et le visiteur n'avait plus aucune
  // porte d'entrée. L'ancienne page /join lisait les métadonnées du lien sur la
  // route publique `/anonymous/link/:id`, qui n'a jamais rien exigé.
  it('laisse rejoindre un lien dont l’historique est privé', async () => {
    installGateway({ linkOverrides: { allowViewHistory: false } });

    render(<SharedConversationExperience linkId={LINK_ID} />);

    expect(await screen.findByRole('dialog')).toHaveTextContent('Week-end Ardèche');
    expect(screen.queryByTestId('join-error')).not.toBeInTheDocument();
  });

  it('applique les exigences du lien au formulaire anonyme, historique privé compris', async () => {
    installGateway({ linkOverrides: { allowViewHistory: false, requireEmail: true } });

    render(<SharedConversationExperience linkId={LINK_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: /joinAnonymously/ }));

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
