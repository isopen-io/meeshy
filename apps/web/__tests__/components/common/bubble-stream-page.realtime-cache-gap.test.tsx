/**
 * TÉMOIN A — DÉFAUT A (voir CLAUDE.md / mission) : un `message:new` reçu
 * pendant la lecture initiale (React Query cache encore VIDE, requête REST
 * en vol) est perdu pour toute la session.
 *
 * Chemin monté : celui de la page d'accueil (`app/page.tsx` → `BubbleStreamPage`
 * avec `conversationId="meeshy"`, le slug de la conversation publique). C'est
 * le SEUL chemin qui ne monte PAS `useSocketCacheSync` (le filet « si ça n'a
 * pas atterri, invalide ») — `ConversationLayout` est le seul monteur de ce
 * hook. Ici, l'unique écrivain socket est `addMessage`
 * (`hooks/queries/use-conversation-messages-rq.ts`), dont le corps est :
 *
 *     queryClient.setQueryData(queryKey, (old) => {
 *       if (!old) return old;   // <-- rien n'est écrit si le cache est vide
 *       ...
 *     });
 *
 * Le composant est monté RÉELLEMENT (pas de mock de `BubbleStreamPage`
 * lui-même, ni du hook `useConversationMessagesRQ`, ni de `useStreamSocket`) :
 * seule la couche réseau/socket est doublée, exactement comme
 * `__tests__/hooks/use-stream-socket.test.tsx` le fait déjà pour capturer
 * `onNewMessage`. `ConversationMessages` (747 lignes, hors périmètre du
 * défaut) est réduit à un stub qui rend `messages` telles que le composant
 * les lui passe — c'est donc bien CE QUE L'UTILISATEUR VOIT, jamais un accès
 * direct au store/cache React Query, qui est vérifié.
 *
 * Rouge aujourd'hui : le message temps réel n'apparaît jamais à l'écran.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message, User } from '@meeshy/shared/types';

// jsdom n'implémente pas `Element.scrollTo` — le scroll-vers-le-récent de
// `handleNewMessage` (bubble-stream-page.tsx) l'appelle dans un `setTimeout`
// dès que l'expéditeur du message reçu diffère de l'utilisateur courant.
// Convention déjà en place ailleurs dans cette suite (ConversationMessages,
// reading-mode-*).
Element.prototype.scrollTo = jest.fn();

// ─────────────────────────────────────────────────────────────────────────
// i18n — simple passthrough, comme les autres suites de la page d'accueil.
// ─────────────────────────────────────────────────────────────────────────
jest.mock('@/hooks/useI18n', () => ({
  useI18n: (_ns?: string) => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: (_ns?: string) => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    isLoading: false,
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────
// Notifications globales — hors périmètre du défaut, réseau/socket propres.
// ─────────────────────────────────────────────────────────────────────────
jest.mock('@/hooks/queries/use-notifications-manager-rq', () => ({
  useNotificationsManagerRQ: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────
// Lentille de lecture — hors périmètre, et `useThreadActiveReadingMode`
// consomme `useSearchParams` (next/navigation) via `useReadingModesFlag`.
// ─────────────────────────────────────────────────────────────────────────
jest.mock('@/hooks/lentille/use-thread-reading-mode', () => ({
  useThreadActiveReadingMode: () => 'bubble',
}));

// ─────────────────────────────────────────────────────────────────────────
// Composants d'affichage lourds, non concernés par le défaut : réduits à des
// stubs. `ConversationMessages` est LE stub qui compte — il projette
// fidèlement la prop `messages` reçue du composant réel vers le DOM.
// ─────────────────────────────────────────────────────────────────────────
jest.mock('@/components/conversations/ConversationMessages', () => ({
  ConversationMessages: ({ messages }: { messages: Message[] }) => (
    <div data-testid="conversation-messages">
      {messages.map((m) => (
        <div key={m.id} data-testid="rendered-message">
          {m.content}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('@/components/attachments/AttachmentGallery', () => ({
  AttachmentGallery: () => null,
}));

jest.mock('@/components/bubble-stream', () => ({
  StreamHeader: () => <div data-testid="stream-header" />,
  StreamThreadHeader: () => <div data-testid="stream-thread-header" />,
  StreamComposer: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({}));
    return <div data-testid="stream-composer" />;
  }),
  StreamSidebar: () => <div data-testid="stream-sidebar" />,
}));

// ─────────────────────────────────────────────────────────────────────────
// Couche socket : doublée exactement comme `use-stream-socket.test.tsx` —
// on capture `onNewMessage` pour simuler l'arrivée d'un `message:new`.
// ─────────────────────────────────────────────────────────────────────────
let capturedOnNewMessage: ((message: Message) => void) | null = null;

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: (options: { onNewMessage?: (message: Message) => void }) => {
    capturedOnNewMessage = options.onNewMessage ?? null;
    return {
      isConnected: true,
      status: { isConnected: true, hasSocket: true },
      connectionStatus: { isConnected: true, hasSocket: true },
      sendMessage: jest.fn(),
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      startTyping: jest.fn(),
      stopTyping: jest.fn(),
      reconnect: jest.fn(),
      getDiagnostics: jest.fn(() => ({})),
    };
  },
}));

// Le service socket est doublé par un PROXY plutôt que par une liste de
// méthodes : `useSocketCacheSync`, désormais monté par `BubbleStreamPage`
// (moitié 1 du défaut A), souscrit à une trentaine d'événements. Les énumérer
// ici ferait de ce fichier un inventaire à tenir à jour — et son échec, à la
// première souscription ajoutée en amont, ressemblerait à une régression du
// composant. Toute méthode `on*` non explicitement doublée enregistre donc son
// handler dans `mockSocketHandlers` et rend un désabonnement muet ; c'est ce
// registre que le second test rejoue.
const mockSocketHandlers: Record<string, (...args: never[]) => void> = {};

jest.mock('@/services/meeshy-socketio.service', () => {
  const explicit: Record<string, unknown> = {
    getCurrentConversationId: jest.fn(() => null),
    getConnectionDiagnostics: jest.fn(() => ({ isConnected: true, hasSocket: true })),
    reconnect: jest.fn(),
    stopTyping: jest.fn(),
  };

  return {
    meeshySocketIOService: new Proxy(explicit, {
      get(target, property) {
        if (property in target) return target[property as string];
        if (typeof property !== 'string' || !property.startsWith('on')) return undefined;
        return (handler: (...args: never[]) => void) => {
          mockSocketHandlers[property] = handler;
          return () => {
            delete mockSocketHandlers[property];
          };
        };
      },
    }),
  };
});

// ─────────────────────────────────────────────────────────────────────────
// Couche REST des messages : c'est ELLE qu'on retient en vol pour garder le
// cache React Query VIDE pendant qu'on fait « arriver » le message socket.
// Mockée au niveau `@/services/conversations.service` : c'est le module que
// `use-conversation-messages-rq.ts` importe directement, et celui que
// `@/services` (barrel, consommé par bubble-stream-page.tsx pour
// `getParticipants`) réexporte — un seul mock couvre les deux specifiers,
// même chemin de fichier résolu.
// ─────────────────────────────────────────────────────────────────────────
let resolveGetMessages: ((value: {
  messages: Message[];
  hasMore: boolean;
  total: number;
}) => void) | null = null;

const getMessagesMock = jest.fn(
  (..._args: unknown[]) =>
    new Promise<{ messages: Message[]; hasMore: boolean; total: number }>((resolve) => {
      resolveGetMessages = resolve;
    })
);

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: (...args: unknown[]) => getMessagesMock(...args),
    getParticipants: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/utils/token-utils', () => ({
  getAuthToken: () => ({ value: 'test-token' }),
}));

// ─────────────────────────────────────────────────────────────────────────

import { BubbleStreamPage } from '@/components/common/bubble-stream-page';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}

const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
} as User;

function buildIncomingMessage(): Message {
  return {
    id: 'msg-realtime-1',
    conversationId: 'conv-object-id-1',
    content: 'Bonjour venu du socket pendant le chargement',
    originalLanguage: 'fr',
    senderId: 'user-2',
    sender: { id: 'user-2', username: 'other', displayName: 'Other User' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    translations: [],
    attachments: [],
  } as unknown as Message;
}

describe('BubbleStreamPage — message:new pendant la lecture initiale (cache vide)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNewMessage = null;
    resolveGetMessages = null;
  });

  // RÉVISÉ le 2026-08-25, après qu'une revue a montré que l'assertion d'origine
  // — « le message s'affiche immédiatement » — exigeait un comportement DANGEREUX
  // sur ce chemin précis.
  //
  // `meeshySocketIOService.onNewMessage` est un abonnement GLOBAL : il délivre
  // les messages de TOUTES les conversations rejointes, pas seulement celle de
  // l'écran. Le seul filtre du produit se garde sur `conversationObjectIdRef`,
  // alimenté par le PREMIER message chargé — donc null exactement pendant la
  // fenêtre visée ici. Et l'écran `/` est clé-é sur un SLUG (« meeshy ») quand
  // le fil porte des ObjectId : sur un cache vide, il n'existe AUCUNE source
  // d'où tirer la résolution.
  //
  // Semer sans attribution afficherait donc, sur l'accueil, le message d'une
  // AUTRE conversation. La règle retenue : on ne sème que ce qu'on peut
  // attribuer ; à défaut on REVALIDE dès que la lecture en vol est retombée —
  // elle repart alors vers un serveur qui a, lui, déjà persisté le message.
  // Le message arrive donc, une lecture plus tard, au lieu de ne jamais arriver.
  it('sur un écran clé-é par SLUG, un message non attribuable n’est PAS semé — il est rattrapé par une relecture', async () => {
    const { queryClient } = renderWithQueryClient(
      <BubbleStreamPage user={mockUser} conversationId="meeshy" isAnonymousMode={false} />
    );

    // La requête REST initiale est en vol (promesse non résolue) : le cache
    // React Query de `useConversationMessagesRQ` est encore VIDE à ce stade —
    // exactement la fenêtre que le défaut A cible.
    await waitFor(() => {
      expect(capturedOnNewMessage).not.toBeNull();
    });

    const incoming = buildIncomingMessage();

    await act(async () => {
      capturedOnNewMessage?.(incoming);
      // Laisser React rendre AVANT d'asserter une absence : une assertion
      // négative posée juste après un `act` synchrone passe trivialement,
      // quelle que soit la garde — mesuré, elle ne rougissait pas.
      await Promise.resolve();
    });

    // 1. RIEN n'est semé : le message n'est pas attribuable à cet écran, et
    //    l'afficher reviendrait à montrer sur l'accueil la conversation d'un
    //    autre. C'est la moitié SÛRETÉ de la règle.
    //
    //    L'INSTANT compte : cette assertion se fait AVANT que la lecture
    //    initiale ne retombe. Placée après, elle passait quelle que soit la
    //    garde — la page serveur vide écrasait la graine, et le témoin était
    //    vert pour la mauvaise raison. Mesuré : en neutralisant `attribuable`,
    //    il ne rougissait pas.
    // On interroge le CACHE et non le DOM : une assertion d'absence à l'écran
    // ne discrimine pas ici (le rendu du message dépend d'une fusion qui n'a
    // pas encore eu lieu), alors que la graine, elle, est une écriture
    // OBSERVABLE et immédiate. Mesuré : la version DOM restait verte en
    // neutralisant la garde — elle ne protégeait rien.
    const semé = queryClient
      .getQueryCache()
      .getAll()
      .some((q) =>
        JSON.stringify(q.state.data ?? '').includes(incoming.id),
      );
    expect(semé).toBe(false);

    // La lecture initiale se termine ensuite, sans le message reçu entre
    // temps (le serveur ne le connaît pas encore lui non plus).
    act(() => {
      resolveGetMessages?.({ messages: [], hasMore: false, total: 0 });
    });

    // (assertion de sûreté déplacée ci-dessus)

    // 2. Mais il n'est pas PERDU : la lecture retombée, une relecture repart —
    //    et le serveur, lui, a désormais le message. C'est la moitié
    //    RÉCUPÉRATION, et sans elle la garde ci-dessus ne serait qu'une perte.
    //    Le défaut d'origine ne faisait NI l'une NI l'autre : l'écriture était
    //    jetée par `if (!old) return old;` et rien ne la rattrapait jamais.
    await waitFor(() => {
      expect(getMessagesMock.mock.calls.length).toBeGreaterThan(1);
    });
  });
});

/**
 * TÉMOIN A — MOITIÉ 1 : l'ÉCRIVAIN MANQUANT.
 *
 * `useSocketCacheSync` porte, seul, une trentaine d'événements socket que
 * `BubbleStreamPage` ne traitait pas — il n'était monté que par
 * `ConversationLayout` (`/conversations`). `message:restored-for-me` en est un :
 * il demande une relecture serveur de la liste de la conversation concernée.
 *
 * Ce témoin le rejoue sur la PAGE D'ACCUEIL, dont la liste est clé-ée sur le
 * SLUG `"meeshy"` alors que la charge socket porte l'ObjectId résolu. Il tombe
 * donc pour DEUX raisons distinctes, et c'est voulu :
 *   - si le hook n'est pas monté, aucun handler n'est enregistré ;
 *   - s'il est monté mais invalide `queryKeys.messages.infinite(<ObjectId>)`
 *     comme avant, l'invalidation ne vise AUCUNE requête existante — l'écrivain
 *     « écrit à côté », le défaut d'origine simplement déplacé — et aucune
 *     relecture ne part.
 */
describe('BubbleStreamPage — les événements portés par useSocketCacheSync atteignent la page d’accueil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnNewMessage = null;
    resolveGetMessages = null;
    for (const key of Object.keys(mockSocketHandlers)) delete mockSocketHandlers[key];
  });

  const CONVERSATION_OBJECT_ID = 'conv-object-id-1';

  function buildMessage(id: string, content: string): Message {
    return {
      id,
      conversationId: CONVERSATION_OBJECT_ID,
      content,
      originalLanguage: 'fr',
      senderId: 'user-2',
      sender: { id: 'user-2', username: 'other', displayName: 'Other User' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      translations: [],
      attachments: [],
    } as unknown as Message;
  }

  it('relit la liste clé-ée sur le SLUG quand un message est restauré pour moi', async () => {
    renderWithQueryClient(
      <BubbleStreamPage user={mockUser} conversationId="meeshy" isAnonymousMode={false} />
    );

    const alreadyRead = buildMessage('msg-already-read', 'Message déjà chargé');

    await waitFor(() => {
      expect(resolveGetMessages).not.toBeNull();
    });

    act(() => {
      resolveGetMessages?.({ messages: [alreadyRead], hasMore: false, total: 1 });
    });

    await waitFor(() => {
      expect(screen.getByText(alreadyRead.content)).toBeInTheDocument();
    });

    // Le hook est monté : il a enregistré son handler.
    expect(mockSocketHandlers['onMessageRestoredForMe']).toBeDefined();

    const readsBeforeEvent = getMessagesMock.mock.calls.length;
    const restored = buildMessage('msg-restored', 'Message restauré pour moi');

    act(() => {
      (mockSocketHandlers['onMessageRestoredForMe'] as unknown as (
        data: { messages: { messageId: string; conversationId: string }[] }
      ) => void)({
        messages: [{ messageId: restored.id, conversationId: CONVERSATION_OBJECT_ID }],
      });
    });

    // L'invalidation a bien visé la requête de CET écran : une relecture part.
    await waitFor(() => {
      expect(getMessagesMock.mock.calls.length).toBeGreaterThan(readsBeforeEvent);
    });

    act(() => {
      resolveGetMessages?.({ messages: [alreadyRead, restored], hasMore: false, total: 2 });
    });

    await waitFor(() => {
      expect(screen.getByText(restored.content)).toBeInTheDocument();
    });
  });
});
