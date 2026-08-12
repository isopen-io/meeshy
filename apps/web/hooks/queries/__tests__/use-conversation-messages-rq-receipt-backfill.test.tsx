/**
 * Ce qu'une reconnexion socket doit RATTRAPER : les accusés, pas seulement les
 * messages.
 *
 * Le hook rattrape déjà les MESSAGES manqués pendant une coupure (« Trigger 1 —
 * socket reconnect » → `syncNewerMessages`). Les ACCUSÉS, eux, n'avaient aucun
 * rattrapage : le lot REST (`messagesService.getReadStatuses`) est gardé par une
 * clé `${conversationId}:${dernier message à soi}`, donc il ne se relance QUE
 * lorsqu'on ENVOIE un nouveau message.
 *
 * Depuis que le cycle 85 a rendu ces compteurs MONOTONES — un compteur ne
 * redescend jamais, pour qu'un événement en retard n'efface pas un accusé plus
 * avancé — un `read-status:updated` manqué pendant la coupure n'est plus une
 * valeur en retard qu'un événement suivant corrigerait : c'est un GEL
 * PERMANENT. L'expéditeur regarde une coche « remis » sur un message que tout le
 * monde a lu, jusqu'à ce qu'il en envoie un autre.
 *
 * La reconnexion est le seul instant qui sait qu'un trou a pu se produire. Le
 * lot doit s'y rejouer, exactement comme le catch-up des messages.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import type { Message, User } from '@meeshy/shared/types';

const CONV_ID = '507f1f77bcf86cd799439011';
const MSG_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';

const mockGetMessages = jest.fn();
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
  },
}));

jest.mock('@/services/anonymous-chat.service', () => ({
  AnonymousChatService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    loadMessages: jest.fn(),
  })),
}));

const mockGetReadStatuses = jest.fn();
jest.mock('@/services/conversations/messages.service', () => ({
  messagesService: {
    getReadStatuses: (...args: unknown[]) => mockGetReadStatuses(...args),
  },
}));

let connectionStatus = {
  isOnline: true,
  isSocketConnected: true,
  hasSocket: true,
  isReady: true,
};
jest.mock('@/hooks/use-connection-status', () => ({
  useConnectionStatus: () => connectionStatus,
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    messages: {
      all: ['messages'],
      lists: () => ['messages', 'list'],
      list: (conversationId: string) => ['messages', 'list', conversationId],
      infinite: (conversationId: string) => ['messages', 'list', conversationId, 'infinite'],
    },
  },
}));

const ownMessage = {
  id: MSG_ID,
  content: 'Hello',
  conversationId: CONV_ID,
  senderId: USER_ID,
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  sender: { id: 'participant-1', userId: USER_ID, username: 'alice', displayName: 'Alice' },
} as unknown as Message;

const currentUser = { id: USER_ID, username: 'alice' } as unknown as User;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setConnected(isSocketConnected: boolean) {
  connectionStatus = {
    isOnline: true,
    isSocketConnected,
    hasSocket: true,
    isReady: isSocketConnected,
  };
}

describe('useConversationMessagesRQ — rattrapage des accusés à la reconnexion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setConnected(true);
    mockGetMessages.mockResolvedValue({ messages: [ownMessage], hasMore: false });
    mockGetReadStatuses.mockResolvedValue({
      [MSG_ID]: { totalMembers: 3, receivedCount: 3, readCount: 1 },
    });
  });

  it('relit les accusés une fois la conversation chargée', async () => {
    renderHook(() => useConversationMessagesRQ(CONV_ID, currentUser), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockGetReadStatuses).toHaveBeenCalledTimes(1));
    expect(mockGetReadStatuses).toHaveBeenCalledWith(CONV_ID, [MSG_ID]);
  });

  it('les relit après une coupure socket, sans qu\'un message ait été envoyé', async () => {
    const { rerender } = renderHook(
      () => useConversationMessagesRQ(CONV_ID, currentUser),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockGetReadStatuses).toHaveBeenCalledTimes(1));

    // Coupure puis reconnexion. `rerender` flushe déjà sous `act` : le front
    // monté relance le lot de façon SYNCHRONE, il n'y a rien à attendre —
    // assertion directe plutôt qu'un `waitFor`, dont le délai par défaut d'une
    // seconde rend le test sensible à la charge machine.
    setConnected(false);
    rerender();
    setConnected(true);
    rerender();

    expect(mockGetReadStatuses).toHaveBeenCalledTimes(2);
  });

  it('ne les relit pas tant que la connexion tient', async () => {
    const { rerender } = renderHook(
      () => useConversationMessagesRQ(CONV_ID, currentUser),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockGetReadStatuses).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(mockGetReadStatuses).toHaveBeenCalledTimes(1);
  });
});
