import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ForwardMessageModal } from '../../../components/conversations/forward-message-modal';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { Conversation, Message } from '@meeshy/shared/types';

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
  Input: ({ value, onChange, placeholder }: any) => (
    <input data-testid="input" value={value} onChange={onChange} placeholder={placeholder} />
  ),
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

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

const mockSendMessage = meeshySocketIOService.sendMessage as jest.Mock;

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

const renderModal = (props = {}) =>
  render(<ForwardMessageModal {...defaultProps} {...props} />);

describe('ForwardMessageModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue({ success: true, messageId: 'srv-1' });
  });

  it('rend la liste des conversations en excluant la conversation source', () => {
    renderModal();

    expect(screen.getByText('Équipe produit')).toBeInTheDocument();
    expect(screen.getByText('Général')).toBeInTheDocument();
    expect(screen.queryByText('Conversation source')).not.toBeInTheDocument();
  });

  it('filtre la liste par la recherche', () => {
    renderModal();

    fireEvent.change(screen.getByTestId('input'), { target: { value: 'génér' } });

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

    fireEvent.change(screen.getByTestId('input'), { target: { value: 'alice' } });

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
});
