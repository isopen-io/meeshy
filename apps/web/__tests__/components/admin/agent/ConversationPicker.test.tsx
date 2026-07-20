import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationPicker } from '@/components/admin/agent/ConversationPicker';
import { conversationsCrudService } from '@/services/conversations/crud.service';

jest.mock('@/services/conversations/crud.service', () => ({
  conversationsCrudService: {
    getConversation: jest.fn(),
    searchConversations: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'en' }),
}));

jest.mock('use-debounce', () => ({
  useDebounce: (v: unknown) => [v],
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({
    onChange,
    value,
    placeholder,
    autoFocus,
  }: {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    value?: string;
    placeholder?: string;
    autoFocus?: boolean;
  }) => (
    <input
      data-testid="picker-input"
      onChange={onChange}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/ui/popover', () => {
  const React = require('react');

  const PopoverContext = React.createContext<{
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }>({ open: false, onOpenChange: () => {} });

  const Popover = ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) => (
    <PopoverContext.Provider value={{ open, onOpenChange }}>
      <div>{children}</div>
    </PopoverContext.Provider>
  );

  const PopoverTrigger = ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    const { onOpenChange } = React.useContext(PopoverContext);
    return (
      <div
        data-testid="popover-trigger"
        onClick={() => onOpenChange(true)}
      >
        {children}
      </div>
    );
  };

  const PopoverContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = React.useContext(PopoverContext);
    return open ? <div data-testid="popover-content">{children}</div> : null;
  };

  return { Popover, PopoverTrigger, PopoverContent };
});

function makeConversation(overrides = {}) {
  return {
    id: 'conv-abc123def456ghijklmn',
    title: 'Test Conversation',
    type: 'group',
    memberCount: 5,
    visibility: 'public',
    createdAt: '2024-01-01T00:00:00Z',
    lastMessageAt: '2024-06-01T00:00:00Z',
    identifier: 'test-conv',
    avatar: null,
    banner: null,
    lastMessage: null,
    ...overrides,
  };
}

function defaultProps(overrides = {}) {
  return {
    selectedId: null,
    onSelect: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(
    makeConversation()
  );
  (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([]);
});

describe('ConversationPicker', () => {
  describe('with selectedId', () => {
    it('fetches and shows the selected conversation card on mount', async () => {
      const conv = makeConversation({ title: 'My Group' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: 'conv-abc123def456ghijklmn' })} />);

      await waitFor(() => {
        expect(screen.getByText('My Group')).toBeInTheDocument();
      });

      expect(conversationsCrudService.getConversation).toHaveBeenCalledWith(
        'conv-abc123def456ghijklmn'
      );
    });

    it('shows clear button when onClear is provided and selectedConversation is loaded', async () => {
      const conv = makeConversation();
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);
      const onClear = jest.fn();

      render(
        <ConversationPicker
          {...defaultProps({ selectedId: conv.id, onClear })}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
      });
    });

    it('calls onClear when clear button is clicked', async () => {
      const conv = makeConversation();
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);
      const onClear = jest.fn();

      render(
        <ConversationPicker
          {...defaultProps({ selectedId: conv.id, onClear })}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Clear selection'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('shows lastMessage content when selectedConversation has lastMessage', async () => {
      const conv = makeConversation({
        lastMessage: {
          content: 'Hello from last message',
          sender: { displayName: 'Alice' },
        },
      });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(
        <ConversationPicker
          {...defaultProps({ selectedId: conv.id })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Hello from last message')).toBeInTheDocument();
      });
    });

    it('does not show clear button when onClear is not provided', async () => {
      const conv = makeConversation();
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(
        <ConversationPicker
          {...defaultProps({ selectedId: conv.id })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });
  });

  describe('with no selectedId', () => {
    it('shows popover trigger button with placeholder text', () => {
      render(
        <ConversationPicker
          {...defaultProps({ placeholder: 'Search a conversation...' })}
        />
      );

      expect(screen.getByText('Search a conversation...')).toBeInTheDocument();
    });

    it('does not fetch conversation when selectedId is null', () => {
      render(<ConversationPicker {...defaultProps()} />);
      expect(conversationsCrudService.getConversation).not.toHaveBeenCalled();
    });
  });

  describe('label prop', () => {
    it('renders label text when label is provided', () => {
      render(<ConversationPicker {...defaultProps({ label: 'Select Room' })} />);
      expect(screen.getByText('Select Room')).toBeInTheDocument();
    });

    it('does not render label element when label is not provided', () => {
      render(<ConversationPicker {...defaultProps()} />);
      expect(screen.queryByText('Select Room')).not.toBeInTheDocument();
    });
  });

  describe('search behavior', () => {
    it('does not call searchConversations when query is less than 2 characters', async () => {
      render(<ConversationPicker {...defaultProps()} />);

      fireEvent.click(screen.getByTestId('popover-trigger').firstChild as Element);

      await act(async () => {});

      expect(conversationsCrudService.searchConversations).not.toHaveBeenCalled();
    });

    it('calls searchConversations when query length is 2 or more', async () => {
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([]);

      render(<ConversationPicker {...defaultProps()} />);

      const trigger = screen.getByText('Search a conversation...');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('picker-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('picker-input'), {
        target: { value: 'ab' },
      });

      await waitFor(() => {
        expect(conversationsCrudService.searchConversations).toHaveBeenCalledWith('ab');
      });
    });

    it('shows loader spinner while loading results', async () => {
      (conversationsCrudService.searchConversations as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      render(<ConversationPicker {...defaultProps()} />);

      fireEvent.click(screen.getByText('Search a conversation...'));

      await waitFor(() => {
        expect(screen.getByTestId('picker-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('picker-input'), {
        target: { value: 'ab' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
      });
    });

    it('shows conversation results when search returns data', async () => {
      const conv = makeConversation({ title: 'Found Conversation' });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);

      fireEvent.click(screen.getByText('Search a conversation...'));

      await waitFor(() => {
        expect(screen.getByTestId('picker-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('picker-input'), {
        target: { value: 'found' },
      });

      await waitFor(() => {
        expect(screen.getByText('Found Conversation')).toBeInTheDocument();
      });
    });

    it('calls onSelect with conv.id and closes popover when a result is clicked', async () => {
      const conv = makeConversation({ title: 'Clickable Conv' });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);
      const onSelect = jest.fn();

      render(<ConversationPicker {...defaultProps({ onSelect })} />);

      fireEvent.click(screen.getByText('Search a conversation...'));

      await waitFor(() => {
        expect(screen.getByTestId('picker-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('picker-input'), {
        target: { value: 'cl' },
      });

      await waitFor(() => {
        expect(screen.getByText('Clickable Conv')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Clickable Conv'));

      expect(onSelect).toHaveBeenCalledWith(conv.id);

      await waitFor(() => {
        expect(screen.queryByTestId('popover-content')).not.toBeInTheDocument();
      });
    });
  });

  describe('fetchSelected edge cases', () => {
    it('clears selectedConversation when selectedId changes to null', async () => {
      const conv = makeConversation({ title: 'Will Disappear' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      const { rerender } = render(
        <ConversationPicker {...defaultProps({ selectedId: conv.id })} />
      );
      await waitFor(() => expect(screen.getByText('Will Disappear')).toBeInTheDocument());

      rerender(<ConversationPicker {...defaultProps({ selectedId: null })} />);
      await waitFor(() => {
        expect(screen.queryByText('Will Disappear')).not.toBeInTheDocument();
        expect(screen.getByText('Search a conversation...')).toBeInTheDocument();
      });
    });

    it('handles error in fetchSelected gracefully without crashing', async () => {
      (conversationsCrudService.getConversation as jest.Mock).mockRejectedValue(new Error('fetch failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<ConversationPicker {...defaultProps({ selectedId: 'bad-id' })} />);
      await act(async () => { await Promise.resolve(); });

      // Component should still be in an operable state (popover trigger or empty state)
      expect(screen.getByText('Search a conversation...')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });

  describe('search error handling', () => {
    it('handles searchConversations error without crashing', async () => {
      (conversationsCrudService.searchConversations as jest.Mock).mockRejectedValue(new Error('search failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));

      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());

      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'ab' } });

      await waitFor(() => {
        expect(conversationsCrudService.searchConversations).toHaveBeenCalledWith('ab');
      });
      // Should not crash; loading should have been set back to false
      consoleSpy.mockRestore();
    });
  });

  describe('selected conversation card details', () => {
    it('renders avatar img when conversation has avatar', async () => {
      const conv = makeConversation({ avatar: 'https://example.com/avatar.jpg' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => expect(screen.getByText('Test Conversation')).toBeInTheDocument());

      // Image has empty alt="" so role is 'presentation', use querySelector
      const img = document.querySelector('img[src="https://example.com/avatar.jpg"]');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('renders banner when conversation has banner url', async () => {
      const conv = makeConversation({ banner: 'https://example.com/banner.jpg' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => expect(screen.getByText('Test Conversation')).toBeInTheDocument());

      // Banner div has inline background-image style
      const container = document.querySelector('[style*="background-image"]');
      expect(container).not.toBeNull();
    });

    it('does not render member count when memberCount is 0', async () => {
      const conv = makeConversation({ memberCount: 0 });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => expect(screen.getByText('Test Conversation')).toBeInTheDocument());

      // memberCount 0 means the members section is not shown
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('does not render calendar date when createdAt is null', async () => {
      const conv = makeConversation({ createdAt: null });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => expect(screen.getByText('Test Conversation')).toBeInTheDocument());

      expect(screen.queryByTestId('calendar-icon')).not.toBeInTheDocument();
    });
  });

  describe('search results details', () => {
    it('shows lastMessageAt date in results when conv has lastMessageAt', async () => {
      const conv = makeConversation({ lastMessageAt: '2024-06-15T00:00:00Z' });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => expect(screen.getByText('Test Conversation')).toBeInTheDocument());
      // The separator dot for date is rendered
      expect(screen.getByText('•')).toBeInTheDocument();
    });

    it('shows lastMessage content in results when conv has lastMessage.content', async () => {
      const conv = makeConversation({ lastMessage: { content: 'Preview text here', sender: null } });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => expect(screen.getByText('Preview text here')).toBeInTheDocument());
    });

    it('shows member count in results when conv.memberCount > 0', async () => {
      const conv = makeConversation({ memberCount: 7 });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    });
  });

  describe('getIcon', () => {
    it('renders MessageSquare icon for direct type conversations', async () => {
      const conv = makeConversation({ type: 'direct' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(
        <ConversationPicker {...defaultProps({ selectedId: conv.id })} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });

      expect(screen.getByTestId('messagesquare-icon')).toBeInTheDocument();
    });

    it('renders Users icon for group type conversations', async () => {
      const conv = makeConversation({ type: 'group' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(
        <ConversationPicker {...defaultProps({ selectedId: conv.id })} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });

      const usersIcons = screen.getAllByTestId('users-icon');
      expect(usersIcons.length).toBeGreaterThan(0);
    });

    it('renders Globe icon for public type conversations', async () => {
      const conv = makeConversation({ type: 'public' });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(
        <ConversationPicker {...defaultProps({ selectedId: conv.id })} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });

      expect(screen.getByTestId('globe-icon')).toBeInTheDocument();
    });
  });

  describe('fallback branches', () => {
    it('shows untitled fallback when selected conversation has no title', async () => {
      const conv = makeConversation({ title: null });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => {
        expect(screen.getByText('agent.conversationPicker.untitled')).toBeInTheDocument();
      });
    });

    it('shows conv.id when selected conversation has no identifier', async () => {
      const conv = makeConversation({ identifier: null });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => {
        // When identifier is null, falls back to id
        expect(screen.getByText(conv.id)).toBeInTheDocument();
      });
    });

    it('shows Utilisateur fallback when lastMessage sender has no displayName', async () => {
      const conv = makeConversation({
        lastMessage: {
          content: 'Hello world',
          sender: { displayName: null },
        },
      });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument();
        expect(screen.getByText(/Utilisateur/)).toBeInTheDocument();
      });
    });

    it('shows Utilisateur fallback when lastMessage has no sender at all', async () => {
      const conv = makeConversation({
        lastMessage: {
          content: 'No sender here',
          sender: null,
        },
      });
      (conversationsCrudService.getConversation as jest.Mock).mockResolvedValue(conv);

      render(<ConversationPicker {...defaultProps({ selectedId: conv.id })} />);
      await waitFor(() => {
        expect(screen.getByText('No sender here')).toBeInTheDocument();
        expect(screen.getByText(/Utilisateur/)).toBeInTheDocument();
      });
    });

    it('shows untitled fallback in search results when conv has no title', async () => {
      const conv = makeConversation({ title: null });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => {
        expect(screen.getByText('agent.conversationPicker.untitled')).toBeInTheDocument();
      });
    });

    it('shows conv.id in search results when conv has no identifier', async () => {
      const conv = makeConversation({ identifier: null });
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue([conv]);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });
      // The identifier fallback shows the id
      expect(screen.getByText(conv.id)).toBeInTheDocument();
    });

    it('setResults falls back to empty array when searchConversations returns null/undefined', async () => {
      // searchConversations returns null → setResults(null || []) → []
      (conversationsCrudService.searchConversations as jest.Mock).mockResolvedValue(null);

      render(<ConversationPicker {...defaultProps()} />);
      fireEvent.click(screen.getByText('Search a conversation...'));
      await waitFor(() => expect(screen.getByTestId('picker-input')).toBeInTheDocument());
      fireEvent.change(screen.getByTestId('picker-input'), { target: { value: 'te' } });

      await waitFor(() => {
        expect(conversationsCrudService.searchConversations).toHaveBeenCalledWith('te');
      });
      // No crash, no results shown
      expect(screen.queryByText('Test Conversation')).not.toBeInTheDocument();
    });
  });
});
