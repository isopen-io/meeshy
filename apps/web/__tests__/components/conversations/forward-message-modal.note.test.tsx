/**
 * Transférer sans pouvoir DIRE POURQUOI oblige à fermer la feuille, retrouver la
 * conversation et écrire — trois gestes pour un mot. La feuille porte donc un
 * champ « Ajouter un message… », comme la feuille de partage des applications de
 * référence.
 *
 * Le mot voyage comme un message À PART, envoyé APRÈS le transfert et dans la
 * même conversation. Il ne remplace pas le contenu transféré : `forwardedFromId`
 * désigne un message d'origine dont le texte est celui de l'original, et le
 * réécrire ferait mentir l'aperçu de source. Deux messages, l'ordre garanti.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ForwardMessageModal } from '@/components/conversations/forward-message-modal';
import type { Conversation, Message } from '@meeshy/shared/types';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) =>
      typeof params === 'string' ? params : key,
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

const mockSendMessage = jest.fn();
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { sendMessage: (...args: unknown[]) => mockSendMessage(...args) },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('use-debounce', () => ({ useDebounce: (value: unknown) => [value] }));
jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({
  useFriendRequestsV2: () => ({ connected: [] }),
}));
jest.mock('@/services/contacts-directory.service', () => ({
  contactsDirectoryService: { list: jest.fn(() => Promise.resolve({ contacts: [], hasMore: false })) },
}));
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    searchConversations: jest.fn(() => Promise.resolve([])),
    createConversation: jest.fn(() => Promise.resolve({ id: 'unused' })),
  },
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => <input data-testid="input" {...props} />,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: { children: React.ReactNode }) => <button {...rest}>{children}</button>,
}));

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({ id: 'conv-a', title: 'Équipe produit', type: 'group', participants: [], ...overrides }) as unknown as Conversation;

const message = {
  id: 'msg-1',
  content: 'Hello world',
  conversationId: 'conv-src',
  originalLanguage: 'en',
  senderId: 'user-1',
  isViewOnce: false,
} as unknown as Message;

const renderModal = () =>
  render(
    <ForwardMessageModal
      isOpen
      onClose={jest.fn()}
      message={message}
      sourceConversationId="conv-src"
      conversations={[makeConversation()]}
    />,
  );

describe('ForwardMessageModal — le mot qui accompagne le transfert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue({ success: true, messageId: 'srv-1' });
  });

  it('offre un champ pour accompagner le transfert', () => {
    renderModal();

    expect(screen.getByTestId('forward-note')).toBeInTheDocument();
  });

  it("n'envoie QUE le transfert quand le champ est vide", async () => {
    renderModal();

    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    expect(mockSendMessage.mock.calls[0][8]).toBe('msg-1');
  });

  it("n'envoie QUE le transfert quand le champ ne porte que des espaces", async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('forward-note'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
  });

  it('envoie le mot APRÈS le transfert, dans la même conversation', async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('forward-note'), { target: { value: 'regarde ça' } });
    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));

    const [forwardCall, noteCall] = mockSendMessage.mock.calls;
    expect(forwardCall[0]).toBe('conv-a');
    expect(forwardCall[8]).toBe('msg-1');

    expect(noteCall[0]).toBe('conv-a');
    expect(noteCall[1]).toBe('regarde ça');
  });

  it("le mot est un message PROPRE : il ne porte aucune source de transfert", async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('forward-note'), { target: { value: 'regarde ça' } });
    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));

    const noteCall = mockSendMessage.mock.calls[1];
    expect(noteCall[8]).toBeUndefined();
    expect(noteCall[9]).toBeUndefined();
  });

  it("ne renvoie PAS le mot si le transfert lui-même a échoué", async () => {
    mockSendMessage.mockResolvedValueOnce({ success: false });
    renderModal();

    fireEvent.change(screen.getByTestId('forward-note'), { target: { value: 'regarde ça' } });
    fireEvent.click(screen.getByTestId('forward-send-conv-a'));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
