/**
 * Cycle 67 — la bannière d'épingle ne s'était jamais affichée.
 *
 * Le composant lisait `data.messages[0]` alors que la route répond par
 * l'enveloppe canonique du dépôt (`sendSuccess` → `{ success, data: [...] }`) :
 * `data.messages` valait toujours `undefined`, donc `pinnedMessage` aussi, donc
 * la bannière rendait `null` même sur un 200 parfaitement valide. Les deux
 * suites qui montent `ConversationView` / `ConversationLayout` la remplacent
 * par `() => null` — aucun témoin n'avait jamais exercé son chemin de données.
 *
 * Ces témoins portent sur le CONTRAT de la route (l'enveloppe réelle) et sur le
 * Prisme Linguistique, pas sur le balisage.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

/**
 * Faux socket : un registre de handlers par nom d'événement, plus un `emit`
 * de test qui les rejoue. Les témoins de portée en ont besoin — la bannière
 * s'abonne à `message:pinned` / `message:unpinned` et le vrai service rend
 * `null` ici.
 */
const socketHandlers = new Map<string, Set<(payload: unknown) => void>>();
const fakeSocket = {
  on: (event: string, handler: (payload: unknown) => void) => {
    const set = socketHandlers.get(event) ?? new Set();
    set.add(handler);
    socketHandlers.set(event, set);
  },
  off: (event: string, handler: (payload: unknown) => void) => {
    socketHandlers.get(event)?.delete(handler);
  },
};
const emitToBanner = (event: string, payload: unknown) => {
  socketHandlers.get(event)?.forEach((handler) => handler(payload));
};

let mockSocket: typeof fakeSocket | null = null;
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: () => mockSocket },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...rest }: React.ComponentProps<'div'>) => <div {...rest}>{children}</div>,
  },
}));

let mockUser: Record<string, unknown> | null = null;
jest.mock('@/stores/auth-store', () => ({
  useUser: () => mockUser,
}));

import { PinnedMessageBanner } from '@/components/conversations/PinnedMessageBanner';

const CONV_ID = 'conv-1';

/** L'enveloppe RÉELLE de `GET /conversations/:id/pinned-messages`. */
const pinnedResponse = (message: Record<string, unknown>) => ({
  success: true,
  data: [message],
});

const pinnedMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  content: 'Hello everyone',
  originalLanguage: 'en',
  pinnedAt: '2026-08-11T00:00:00Z',
  pinnedBy: 'user-1',
  translations: [],
  sender: { id: 'part-1', username: 'alice', displayName: 'Alice' },
  ...overrides,
});

function renderBanner(conversationId: string = CONV_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  const ui = (id: string) => (
    <QueryClientProvider client={queryClient}>
      <PinnedMessageBanner conversationId={id} onNavigateToMessage={() => {}} />
    </QueryClientProvider>
  );
  const view = render(ui(conversationId));
  return {
    ...view,
    // `ConversationView` monte la bannière SANS `key` : changer de conversation
    // réutilise l'instance et son état local. `rerender` modélise exactement ça.
    switchConversation: (id: string) => view.rerender(ui(id)),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  socketHandlers.clear();
  mockSocket = null;
  mockUser = { id: 'user-2', systemLanguage: 'fr' };
});

describe('PinnedMessageBanner', () => {
  it("affiche l'épingle servie par l'enveloppe réelle de la route", async () => {
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage()));

    renderBanner();

    expect(await screen.findByText(/Hello everyone/)).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  it("ne rend rien quand aucun message n'est épinglé", async () => {
    mockApiGet.mockResolvedValue({ success: true, data: [] });

    const { container } = renderBanner();

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('rend la traduction de la langue primaire du lecteur, pas le texte original', async () => {
    mockApiGet.mockResolvedValue(
      pinnedResponse(
        pinnedMessage({
          content: 'Hello everyone',
          originalLanguage: 'en',
          translations: [
            { targetLanguage: 'es', translatedContent: 'Hola a todos' },
            { targetLanguage: 'fr', translatedContent: 'Bonjour à tous' },
          ],
        })
      )
    );

    renderBanner();

    expect(await screen.findByText(/Bonjour à tous/)).toBeInTheDocument();
    expect(screen.queryByText(/Hello everyone/)).not.toBeInTheDocument();
  });

  it("rend l'original quand aucune traduction ne sert le prisme du lecteur", async () => {
    // Règle critique #1 du Prisme : ne JAMAIS retomber sur une traduction
    // quelconque — l'absence de traduction vers la langue du lecteur signifie
    // que servir une troisième langue serait pire que l'original.
    mockApiGet.mockResolvedValue(
      pinnedResponse(
        pinnedMessage({
          translations: [{ targetLanguage: 'es', translatedContent: 'Hola a todos' }],
        })
      )
    );

    renderBanner();

    expect(await screen.findByText(/Hello everyone/)).toBeInTheDocument();
    expect(screen.queryByText(/Hola a todos/)).not.toBeInTheDocument();
  });

  it("n'affiche jamais un cryptogramme à la place d'une traduction", async () => {
    // Une traduction chiffrée porte un `translatedContent` en base64 et la clé
    // ne transite pas par ce chemin : l'afficher mettrait du bruit dans la
    // bannière. On retombe sur l'original, comme le fait le helper d'aperçu
    // REST et le résolveur socket iOS.
    mockApiGet.mockResolvedValue(
      pinnedResponse(
        pinnedMessage({
          translations: [
            { targetLanguage: 'fr', translatedContent: 'U2FsdGVkX1+abc123==', isEncrypted: true },
          ],
        })
      )
    );

    renderBanner();

    expect(await screen.findByText(/Hello everyone/)).toBeInTheDocument();
    expect(screen.queryByText(/U2FsdGVkX1/)).not.toBeInTheDocument();
  });

  it("rend l'original quand la langue d'origine gagne son rang dans le prisme", async () => {
    // Prisme ['en', 'fr'], message anglais, traduction française disponible :
    // la langue d'origine occupe le rang 1, elle gagne.
    mockUser = { id: 'user-2', systemLanguage: 'en', regionalLanguage: 'fr' };
    mockApiGet.mockResolvedValue(
      pinnedResponse(
        pinnedMessage({
          translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour à tous' }],
        })
      )
    );

    renderBanner();

    expect(await screen.findByText(/Hello everyone/)).toBeInTheDocument();
  });
});

/**
 * Cycle 80 — le rejet de la bannière était un booléen COLLANT.
 *
 * `dismissed` ne se réarmait sur rien : ni sur une nouvelle épingle, ni sur un
 * changement de conversation. Or `ConversationView` monte la bannière SANS
 * `key` (`conversationId` n'est qu'une prop), donc changer de conversation
 * réutilise l'instance ET son état local — un rejet dans une conversation
 * masquait l'épingle de TOUTES les autres, sans retour possible avant un
 * rechargement complet de la page.
 *
 * C'est la forme nommée en clôture du cycle 79 : une transition DESCENDANTE
 * (« je masque ») sans la MONTANTE appariée (« ce que je masquais a changé »).
 * Le correctif retient l'IDENTITÉ de ce qui a été rejeté, pas un booléen — les
 * `messageId` sont des ObjectId, donc globalement uniques : un seul champ ferme
 * les deux trous.
 */
describe('PinnedMessageBanner — réarmement du rejet', () => {
  const dismiss = () => fireEvent.click(screen.getByLabelText('pinnedBanner.close'));

  it('réapparaît quand une NOUVELLE épingle remplace celle qui a été rejetée', async () => {
    mockSocket = fakeSocket;
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage({ id: 'msg-1', content: 'Premier sujet' })));

    renderBanner();
    expect(await screen.findByText(/Premier sujet/)).toBeInTheDocument();

    dismiss();
    expect(screen.queryByText(/Premier sujet/)).not.toBeInTheDocument();

    // Un modérateur épingle un AUTRE message : la bannière doit revenir.
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage({ id: 'msg-2', content: 'Second sujet' })));
    await act(async () => {
      emitToBanner('message:pinned', { conversationId: CONV_ID, messageId: 'msg-2' });
    });

    expect(await screen.findByText(/Second sujet/)).toBeInTheDocument();
  });

  it('reste rejetée tant que c\'est la MÊME épingle qui est servie', async () => {
    // Témoin négatif : le réarmement ne doit pas ressusciter la bannière à
    // chaque refetch, sinon le bouton de fermeture ne ferme plus rien.
    mockSocket = fakeSocket;
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage({ id: 'msg-1', content: 'Premier sujet' })));

    renderBanner();
    expect(await screen.findByText(/Premier sujet/)).toBeInTheDocument();
    dismiss();

    await act(async () => {
      emitToBanner('message:pinned', { conversationId: CONV_ID, messageId: 'msg-1' });
    });

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText(/Premier sujet/)).not.toBeInTheDocument();
  });

  it("un rejet dans une conversation ne masque pas l'épingle d'une AUTRE", async () => {
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage({ id: 'msg-1', content: 'Épingle de la une' })));

    const { switchConversation } = renderBanner('conv-1');
    expect(await screen.findByText(/Épingle de la une/)).toBeInTheDocument();
    dismiss();

    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage({ id: 'msg-2', content: 'Épingle de la deux' })));
    await act(async () => {
      switchConversation('conv-2');
    });

    expect(await screen.findByText(/Épingle de la deux/)).toBeInTheDocument();
  });
});

/**
 * Cycle 80 — l'invalidation partait sur l'épingle de N'IMPORTE QUELLE
 * conversation.
 *
 * La passerelle diffuse `message:pinned` dans la room de la conversation
 * (`ROOMS.conversation`), et le web est joint à TOUTES les rooms de ses
 * conversations : un épinglage ailleurs arrivait donc bien ici, et refetchait
 * la liste d'épingles de la conversation OUVERTE — une requête réseau dont le
 * résultat est par construction identique.
 */
describe('PinnedMessageBanner — portée de l\'invalidation', () => {
  it("ne refetch pas sur l'épingle d'une autre conversation", async () => {
    mockSocket = fakeSocket;
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage()));

    renderBanner();
    await screen.findByText(/Hello everyone/);
    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      emitToBanner('message:pinned', { conversationId: 'conv-ailleurs', messageId: 'msg-9' });
      emitToBanner('message:unpinned', { conversationId: 'conv-ailleurs', messageId: 'msg-9' });
    });

    expect(mockApiGet.mock.calls.length).toBe(callsAfterMount);
  });

  it('refetch bien sur l\'épingle de la conversation ouverte', async () => {
    mockSocket = fakeSocket;
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage()));

    renderBanner();
    await screen.findByText(/Hello everyone/);
    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      emitToBanner('message:pinned', { conversationId: CONV_ID, messageId: 'msg-9' });
    });

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsAfterMount));
  });

  it("refetch quand la charge utile ne nomme AUCUNE conversation", async () => {
    // Lecture par la NÉGATIVE, comme le tri-état `membershipRestored` du cycle
    // 79 : l'absence de `conversationId` ne prouve pas que l'épingle est
    // ailleurs. On ne saute que sur une conversation NOMMÉE et DIFFÉRENTE.
    mockSocket = fakeSocket;
    mockApiGet.mockResolvedValue(pinnedResponse(pinnedMessage()));

    renderBanner();
    await screen.findByText(/Hello everyone/);
    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      emitToBanner('message:pinned', { messageId: 'msg-9' });
    });

    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsAfterMount));
  });
});
