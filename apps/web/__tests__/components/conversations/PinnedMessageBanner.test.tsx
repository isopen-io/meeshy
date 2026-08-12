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
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: () => null },
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

function renderBanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PinnedMessageBanner conversationId={CONV_ID} onNavigateToMessage={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
