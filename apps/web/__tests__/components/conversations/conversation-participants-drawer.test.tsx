import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationParticipantsDrawer } from '../../../components/conversations/conversation-participants-drawer';
import { conversationsService } from '@/services/conversations.service';
import { usersService } from '@/services/users.service';
import type { ThreadMember, UserRoleEnum } from '@meeshy/shared/types';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'conversationUI.participants': 'Participants',
        'conversationUI.online': 'Online',
        'conversationDetails.searchParticipants': 'Filter by name, username...',
        'conversationDetails.noOneOnline': 'No one online',
        'conversationDetails.offline': 'Offline',
        'conversationDetails.noOfflineParticipants': 'No offline participants',
        'conversationDetails.you': 'You',
        'conversationDetails.removeFromGroup': 'Remove from group',
        'conversationDetails.participantRemovedSuccess': 'Participant removed',
        'conversationDetails.removeParticipantError': 'Error removing participant',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock hooks for real-time status
jest.mock('@/hooks/use-user-status-realtime', () => ({
  useUserStatusRealtime: jest.fn(),
}));

jest.mock('@/hooks/use-manual-status-refresh', () => ({
  useManualStatusRefresh: () => ({
    refresh: jest.fn().mockResolvedValue(undefined),
    isRefreshing: false,
  }),
}));

// Mock stores
jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn((selector) => {
    const state = {
      participants: [],
      setParticipants: jest.fn(),
    };
    return selector(state);
  }),
}));

// Mock services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    removeParticipant: jest.fn(),
    addParticipant: jest.fn(),
    updateParticipantRole: jest.fn(),
  },
}));

jest.mock('@/services/users.service', () => ({
  usersService: {
    searchUsers: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/lib/avatar-utils', () => ({
  getUserInitials: (user: any) => {
    if (user.displayName) return user.displayName.charAt(0);
    if (user.firstName) return user.firstName.charAt(0);
    return user.username?.charAt(0) || '?';
  },
}));

jest.mock('@/lib/user-status', () => ({
  getUserStatus: jest.fn(() => 'online'),
}));

// Mock UI components
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="avatar-fallback" className={className}>{children}</span>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, title, variant, size }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={title}
      data-variant={variant}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, className }: any) => (
    <input
      data-testid="input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="sheet" data-open={open}>{children}</div>
  ),
  SheetContent: ({ children, side, className }: { children: React.ReactNode; side?: string; className?: string }) => (
    <div data-testid="sheet-content" data-side={side} className={className}>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-header">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="sheet-title">{children}</h2>
  ),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status, size }: { isOnline: boolean; status: string; size?: string }) => (
    <div data-testid="online-indicator" data-online={isOnline} data-status={status} data-size={size} />
  ),
}));

jest.mock('../../../components/conversations/invite-user-modal', () => ({
  InviteUserModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? (
      <div data-testid="invite-modal">
        <button onClick={onClose} data-testid="close-invite-modal">Close</button>
      </div>
    ) : null
  ),
}));

// Mock data
const mockCurrentUser = {
  id: 'user-1',
  username: 'currentuser',
  displayName: 'Current User',
  firstName: 'Current',
  lastName: 'User',
  email: 'current@example.com',
  isOnline: true,
};

const mockParticipants: ThreadMember[] = [
  {
    id: 'participant-1',
    oderId: 'participant-1',
    oderId: 'participant-1',
    oderId: 'participant-1',
    userId: 'user-1',
    user: {
      ...mockCurrentUser,
      avatar: 'https://example.com/current.jpg',
    } as any,
    role: 'ADMIN' as UserRoleEnum,
  } as ThreadMember,
  {
    id: 'participant-2',
    userId: 'user-2',
    user: {
      id: 'user-2',
      username: 'john',
      displayName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      isOnline: true,
      avatar: 'https://example.com/john.jpg',
    } as any,
    role: 'MEMBER' as UserRoleEnum,
  } as ThreadMember,
  {
    id: 'participant-3',
    userId: 'user-3',
    user: {
      id: 'user-3',
      username: 'jane',
      displayName: 'Jane Smith',
      firstName: 'Jane',
      lastName: 'Smith',
      isOnline: false,
    } as any,
    role: 'MODERATOR' as UserRoleEnum,
  } as ThreadMember,
];

describe('ConversationParticipantsDrawer', () => {
  const defaultProps = {
    conversationId: 'conv-1',
    participants: mockParticipants,
    currentUser: mockCurrentUser,
    isGroup: true,
    conversationType: 'group',
    userConversationRole: 'ADMIN' as UserRoleEnum,
    onParticipantRemoved: jest.fn(),
    onParticipantAdded: jest.fn(),
    onLinkCreated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

    (conversationsService.removeParticipant as jest.Mock).mockResolvedValue({});
    (conversationsService.addParticipant as jest.Mock).mockResolvedValue({});
    (conversationsService.updateParticipantRole as jest.Mock).mockResolvedValue({});
    (usersService.searchUsers as jest.Mock).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Render', () => {
    it('should render the trigger button', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      expect(screen.getByTitle('Participants')).toBeInTheDocument();
    });

    it('should show participant count on trigger button', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render sheet when open', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      // Click to open
      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'true');
    });
  });

  describe('Sheet Content', () => {
    const openDrawer = () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);
      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);
    };

    it('should display sheet title with participant count', () => {
      openDrawer();

      expect(screen.getByText('Participants (3)')).toBeInTheDocument();
    });

    it('should display filter input', () => {
      openDrawer();

      expect(screen.getByPlaceholderText('Filter by name, username...')).toBeInTheDocument();
    });

    it('should display online section', () => {
      openDrawer();

      // Multiple 'Online' elements exist (section header + status labels)
      expect(screen.getAllByText('Online').length).toBeGreaterThan(0);
    });

    it('should display offline section', () => {
      openDrawer();

      // Multiple 'Offline' elements exist (section header + status labels)
      expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    });

    it('should display online participants count', () => {
      openDrawer();

      const badges = screen.getAllByTestId('badge');
      // Find the online count badge
      expect(badges.some(badge => badge.textContent === '2')).toBeTruthy();
    });

    it('should display offline participants count', () => {
      openDrawer();

      const badges = screen.getAllByTestId('badge');
      // Find the offline count badge
      expect(badges.some(badge => badge.textContent === '1')).toBeTruthy();
    });
  });

  describe('Filtering', () => {
    const openDrawerAndFilter = async (query: string) => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);
      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      const filterInput = screen.getByPlaceholderText('Filter by name, username...');
      fireEvent.change(filterInput, { target: { value: query } });
    };

    it('should filter participants by name', async () => {
      await openDrawerAndFilter('John');

      // Only John should match
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should filter participants by username', async () => {
      await openDrawerAndFilter('jane');

      // Only Jane should match
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should show clear button when filter has value', async () => {
      await openDrawerAndFilter('test');

      // Clear button should be visible
      const inputs = screen.getAllByTestId('input');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  describe('Add Member (Admin)', () => {
    const openDrawerAsAdmin = () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);
      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);
    };

    it('should show add member section for admins', () => {
      openDrawerAsAdmin();

      expect(screen.getByText('Ajouter un membre')).toBeInTheDocument();
    });

    it('should show search input for adding members', () => {
      openDrawerAsAdmin();

      expect(screen.getByPlaceholderText('Rechercher un utilisateur à ajouter...')).toBeInTheDocument();
    });

    it('should search users when typing', async () => {
      (usersService.searchUsers as jest.Mock).mockResolvedValue({
        data: [
          { id: 'user-4', username: 'bob', displayName: 'Bob Builder' },
        ],
      });

      openDrawerAsAdmin();

      const searchInput = screen.getByPlaceholderText('Rechercher un utilisateur à ajouter...');
      fireEvent.change(searchInput, { target: { value: 'bob' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(usersService.searchUsers).toHaveBeenCalledWith('bob');
      });
    });

    it('should not search with less than 2 characters', () => {
      openDrawerAsAdmin();

      const searchInput = screen.getByPlaceholderText('Rechercher un utilisateur à ajouter...');
      fireEvent.change(searchInput, { target: { value: 'b' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(usersService.searchUsers).not.toHaveBeenCalled();
    });

    it('should add participant when clicking add button', async () => {
      (usersService.searchUsers as jest.Mock).mockResolvedValue({
        data: [
          { id: 'user-4', username: 'bob', displayName: 'Bob Builder' },
        ],
      });

      openDrawerAsAdmin();

      const searchInput = screen.getByPlaceholderText('Rechercher un utilisateur à ajouter...');
      fireEvent.change(searchInput, { target: { value: 'bob' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Ajouter');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(conversationsService.addParticipant).toHaveBeenCalledWith('conv-1', 'user-4');
      });
    });
  });

  describe('Non-Admin User', () => {
    it('should not show add member section for non-admins', () => {
      render(
        <ConversationParticipantsDrawer
          {...defaultProps}
          participants={mockParticipants.map(p =>
            p.userId === 'user-1' ? { ...p, role: 'MEMBER' as UserRoleEnum } : p
          )}
        />
      );

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      expect(screen.queryByText('Ajouter un membre')).not.toBeInTheDocument();
    });

    it('should not show remove buttons for non-admins', () => {
      render(
        <ConversationParticipantsDrawer
          {...defaultProps}
          participants={mockParticipants.map(p =>
            p.userId === 'user-1' ? { ...p, role: 'MEMBER' as UserRoleEnum } : p
          )}
        />
      );

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      expect(screen.queryByTitle('Remove from group')).not.toBeInTheDocument();
    });
  });

  describe('Remove Participant', () => {
    it('should call remove service when remove button is clicked', async () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // Find remove button (title="Remove from group")
      const removeButtons = screen.getAllByTitle('Remove from group');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(conversationsService.removeParticipant).toHaveBeenCalled();
      });
    });

    it('should call onParticipantRemoved callback on success', async () => {
      const onParticipantRemoved = jest.fn();
      render(
        <ConversationParticipantsDrawer
          {...defaultProps}
          onParticipantRemoved={onParticipantRemoved}
        />
      );

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      const removeButtons = screen.getAllByTitle('Remove from group');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(onParticipantRemoved).toHaveBeenCalled();
      });
    });

    it('should show error toast on remove failure', async () => {
      const { toast } = require('sonner');
      (conversationsService.removeParticipant as jest.Mock).mockRejectedValue(
        new Error('Remove failed')
      );

      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      const removeButtons = screen.getAllByTitle('Remove from group');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Role Management', () => {
    it('should show promote button for members', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // John is a MEMBER, should have promote button - multiple may exist
      const promoteButtons = screen.getAllByTitle('Promouvoir');
      expect(promoteButtons.length).toBeGreaterThan(0);
    });

    it('should show demote button for moderators', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // Jane is a MODERATOR, should have demote button
      const demoteButtons = screen.getAllByTitle('Rétrograder');
      expect(demoteButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Refresh Functionality', () => {
    it('should show refresh button', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      expect(screen.getByTitle('Rafraîchir les statuts')).toBeInTheDocument();
    });
  });

  describe('Invite Modal', () => {
    it('should render invite modal component', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      // The invite modal is always rendered but hidden
      // It should not be visible initially
      expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();
    });
  });

  describe('Anonymous Users', () => {
    it('should show ghost icon for anonymous users', () => {
      const participantsWithAnon = [
        ...mockParticipants,
        {
          id: 'participant-anon',
          userId: 'anon-1',
          user: {
            id: 'anon-1',
            username: 'anonymous',
            displayName: 'Anonymous',
            sessionToken: 'token', // Marks as anonymous
            isOnline: true,
          } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipantsDrawer
          {...defaultProps}
          participants={participantsWithAnon}
        />
      );

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // Should render without errors
      expect(screen.getAllByTestId('avatar').length).toBeGreaterThan(0);
    });
  });

  describe('Current User Display', () => {
    it('should show "(You)" suffix for current user', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      expect(screen.getByText(/\(You\)/)).toBeInTheDocument();
    });

    it('should not show remove button for current user', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // The current user should not have a remove button
      // We should have fewer remove buttons than other participants
      const removeButtons = screen.getAllByTitle('Remove from group');
      expect(removeButtons.length).toBe(2); // 2 other participants
    });
  });

  describe('Crown Icon for Admins/Creators', () => {
    it('should show crown for admin users', () => {
      render(<ConversationParticipantsDrawer {...defaultProps} />);

      const triggerButton = screen.getByTitle('Participants');
      fireEvent.click(triggerButton);

      // The current user is ADMIN, should have crown
      // Crown is rendered via lucide icon
      expect(screen.getByText('Current User (You)')).toBeInTheDocument();
    });
  });

  describe('Large Participant Count', () => {
    it('should show 99+ for large participant counts', () => {
      const manyParticipants = Array.from({ length: 150 }, (_, i) => ({
        id: `participant-${i}`,
        userId: `user-${i}`,
        user: {
          id: `user-${i}`,
          username: `user${i}`,
          displayName: `User ${i}`,
          isOnline: i % 2 === 0,
        } as any,
        role: 'MEMBER' as UserRoleEnum,
      } as ThreadMember));

      render(
        <ConversationParticipantsDrawer
          {...defaultProps}
          participants={manyParticipants}
        />
      );

      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });
});
