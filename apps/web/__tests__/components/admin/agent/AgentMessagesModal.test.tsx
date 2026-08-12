import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { AgentMessageEntry } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getAgentMessages: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'agent.overview.timeAgo.justNow': 'just now',
        'agent.overview.timeAgo.minutes': '{{count}} min ago',
        'agent.overview.timeAgo.hours': '{{count}} h ago',
        'agent.overview.timeAgo.days': '{{count}} d ago',
      };
      return map[key] ?? key;
    },
  }),
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'fr',
}));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({ userId, size, showUsername }: { userId: string; size?: string; showUsername?: boolean }) => (
    <span data-testid="user-display" data-size={size}>{userId}</span>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
    <div data-testid="dialog" data-open={open}>
      <button data-testid="dialog-close" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 data-testid="dialog-title" className={className}>{children}</h2>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    variant?: string; size?: string; className?: string;
  }) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  MessageSquare: () => <svg data-testid="messagesquare-icon" />,
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  ChevronRight: ({ className }: { className?: string }) => <svg className={className} />,
  Reply: () => <svg data-testid="reply-icon" />,
  Globe: () => <svg data-testid="globe-icon" />,
}));

import AgentMessagesModal from '@/components/admin/agent/AgentMessagesModal';

const mockGetAgentMessages = agentAdminService.getAgentMessages as jest.Mock;

function makeMessage(id: string, overrides: Partial<AgentMessageEntry> = {}): AgentMessageEntry {
  return {
    id,
    senderId: 'user-1',
    sender: { id: 'user-1', displayName: 'Alice', username: 'alice', avatar: null },
    content: `Message content ${id}`,
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    originalLanguage: null,
    replyToId: null,
    ...overrides,
  };
}

const defaultProps = {
  conversationId: 'conv-1',
  conversationTitle: 'General Chat',
  open: true,
  onOpenChange: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AgentMessagesModal — loading state', () => {
  it('shows loading spinner while fetching', () => {
    mockGetAgentMessages.mockReturnValue(new Promise(() => {}));
    render(<AgentMessagesModal {...defaultProps} />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });
});

describe('AgentMessagesModal — empty state', () => {
  it('shows empty message when no messages returned', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByText('Aucun message agent pour cette conversation')).toBeInTheDocument()
    );
  });
});

describe('AgentMessagesModal — messages render', () => {
  it('shows conversation title in dialog title', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [makeMessage('m1')], pagination: { total: 1, page: 1, limit: 20 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByTestId('dialog-title').textContent).toContain('General Chat')
    );
  });

  it('renders message content', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [makeMessage('m1')], pagination: { total: 1, page: 1, limit: 20 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Message content m1')).toBeInTheDocument());
  });

  it('shows total count badge', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [makeMessage('m1')], pagination: { total: 42, page: 1, limit: 20 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('42 messages')).toBeInTheDocument());
  });

  it('shows UserDisplay for messages with sender', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [makeMessage('m1')], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('user-display')).toBeInTheDocument());
  });

  it('shows gray circle div for messages without sender', async () => {
    const msg = makeMessage('m1', { sender: null });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => screen.getByText('Message content m1'));
    expect(screen.queryByTestId('user-display')).not.toBeInTheDocument();
  });

  it('shows originalLanguage badge when set', async () => {
    const msg = makeMessage('m1', { originalLanguage: 'en' });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('en')).toBeInTheDocument());
    expect(screen.getByTestId('globe-icon')).toBeInTheDocument();
  });

  it('shows reply badge when replyToId is set', async () => {
    const msg = makeMessage('m1', { replyToId: 'msg-parent' });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('reply')).toBeInTheDocument());
    expect(screen.getByTestId('reply-icon')).toBeInTheDocument();
  });

  it('does not show reply badge when replyToId is null', async () => {
    const msg = makeMessage('m1', { replyToId: null });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => screen.getByText('Message content m1'));
    expect(screen.queryByText('reply')).not.toBeInTheDocument();
  });
});

describe('AgentMessagesModal — load more', () => {
  it('shows load more button when page * limit < total', async () => {
    mockGetAgentMessages.mockResolvedValue({
      success: true,
      data: Array.from({ length: 20 }, (_, i) => makeMessage(`m${i}`)),
      pagination: { total: 50, page: 1, limit: 20 },
    });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Charger la suite')).toBeInTheDocument());
  });

  it('does not show load more button when all messages loaded', async () => {
    mockGetAgentMessages.mockResolvedValue({
      success: true,
      data: [makeMessage('m1')],
      pagination: { total: 1, page: 1, limit: 20 },
    });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => screen.getByText('Message content m1'));
    expect(screen.queryByText('Charger la suite')).not.toBeInTheDocument();
  });

  it('calls getAgentMessages with next page on load more click', async () => {
    mockGetAgentMessages
      .mockResolvedValueOnce({
        success: true,
        data: Array.from({ length: 20 }, (_, i) => makeMessage(`m${i}`)),
        pagination: { total: 50, page: 1, limit: 20 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: Array.from({ length: 20 }, (_, i) => makeMessage(`m${i + 20}`)),
        pagination: { total: 50, page: 2, limit: 20 },
      });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => screen.getByText('Charger la suite'));
    fireEvent.click(screen.getByText('Charger la suite'));
    await waitFor(() => expect(mockGetAgentMessages).toHaveBeenCalledWith('conv-1', 2, 20));
  });
});

describe('AgentMessagesModal — onOpenChange', () => {
  it('calls onOpenChange when dialog close is triggered', async () => {
    const onOpenChange = jest.fn();
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [], pagination: { total: 0 } });
    render(<AgentMessagesModal {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not fetch when open=false', () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [], pagination: { total: 0 } });
    render(<AgentMessagesModal {...defaultProps} open={false} />);
    expect(mockGetAgentMessages).not.toHaveBeenCalled();
  });
});

describe('AgentMessagesModal — fetch failure branches', () => {
  it('shows empty state when fetch returns success=false', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: false });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByText('Aucun message agent pour cette conversation')).toBeInTheDocument()
    );
  });

  it('shows total 0 when pagination is null', async () => {
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [makeMessage('m1')], pagination: null });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => screen.getByText('Message content m1'));
    expect(screen.getByText('0 messages')).toBeInTheDocument();
  });
});

describe('AgentMessagesModal — formatTimeAgo', () => {
  it('shows "just now" for messages less than 1 minute old', async () => {
    const msg = makeMessage('m1', { createdAt: new Date(Date.now() - 30000).toISOString() });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('just now')).toBeInTheDocument());
  });

  it('shows minutes for messages 1-59 minutes old', async () => {
    const msg = makeMessage('m1', { createdAt: new Date(Date.now() - 10 * 60000).toISOString() });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('10 min ago')).toBeInTheDocument());
  });

  it('shows hours for messages 1-23 hours old', async () => {
    const msg = makeMessage('m1', { createdAt: new Date(Date.now() - 3 * 3600000).toISOString() });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('3 h ago')).toBeInTheDocument());
  });

  it('shows days for messages 24+ hours old', async () => {
    const msg = makeMessage('m1', { createdAt: new Date(Date.now() - 48 * 3600000).toISOString() });
    mockGetAgentMessages.mockResolvedValue({ success: true, data: [msg], pagination: { total: 1 } });
    render(<AgentMessagesModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('2 d ago')).toBeInTheDocument());
  });
});
