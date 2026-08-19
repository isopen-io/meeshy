import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      undefined,
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
      undefined,
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
});
