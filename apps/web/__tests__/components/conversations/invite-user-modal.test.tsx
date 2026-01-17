import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InviteUserModal } from '../../../components/conversations/invite-user-modal';
import { apiService } from '@/services/api.service';
import type { User } from '@/types';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// Mock services
jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock utils
jest.mock('@/utils/user', () => ({
  getUserInitials: (user: any) => {
    if (user.displayName) return user.displayName.charAt(0);
    if (user.firstName) return user.firstName.charAt(0);
    return user.username?.charAt(0) || '?';
  },
}));

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
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
  Button: ({ children, onClick, disabled, variant, size, className }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={className}
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

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

// Mock data
const mockCurrentParticipants: User[] = [
  {
    id: 'user-1',
    username: 'currentuser',
    displayName: 'Current User',
    email: 'current@example.com',
  } as User,
];

const mockSearchResults: User[] = [
  {
    id: 'user-2',
    username: 'john',
    displayName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    avatar: 'https://example.com/john.jpg',
  } as User,
  {
    id: 'user-3',
    username: 'jane',
    displayName: 'Jane Smith',
    firstName: 'Jane',
    lastName: 'Smith',
  } as User,
  {
    id: 'user-4',
    username: 'bob',
    displayName: 'Bob Builder',
  } as User,
];

describe('InviteUserModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    conversationId: 'conv-1',
    currentParticipants: mockCurrentParticipants,
    onUserInvited: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (apiService.get as jest.Mock).mockResolvedValue({
      data: mockSearchResults,
    });

    (apiService.post as jest.Mock).mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Render', () => {
    it('should render dialog when isOpen is true', () => {
      render(<InviteUserModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render dialog when isOpen is false', () => {
      render(<InviteUserModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display modal title', () => {
      render(<InviteUserModal {...defaultProps} />);

      expect(screen.getByText('Inviter des utilisateurs')).toBeInTheDocument();
    });

    it('should display search input', () => {
      render(<InviteUserModal {...defaultProps} />);

      expect(screen.getByPlaceholderText('Rechercher des utilisateurs...')).toBeInTheDocument();
    });

    it('should display cancel and invite buttons', () => {
      render(<InviteUserModal {...defaultProps} />);

      expect(screen.getByText('Annuler')).toBeInTheDocument();
      expect(screen.getByText('Inviter 0 utilisateur(s)')).toBeInTheDocument();
    });
  });

  describe('User Search', () => {
    it('should search users when typing', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(apiService.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/users/search')
        );
      });
    });

    it('should not search with less than 2 characters', () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'j' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(apiService.get).not.toHaveBeenCalled();
    });

    it('should display search results', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should filter out current participants from results', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        data: [...mockSearchResults, mockCurrentParticipants[0]],
      });

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'user' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        // Current user should not appear in results
        expect(screen.queryByText('Current User')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no users found', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({ data: [] });

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('Aucun utilisateur trouvé')).toBeInTheDocument();
      });
    });

    it('should show loading indicator during search', async () => {
      let resolveSearch: any;
      (apiService.get as jest.Mock).mockImplementation(
        () => new Promise((resolve) => { resolveSearch = resolve; })
      );

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      // Resolve the search
      await act(async () => {
        resolveSearch({ data: mockSearchResults });
      });
    });
  });

  describe('User Selection', () => {
    it('should add user to selection when clicked', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click on user row to select
      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      // Check that user is in selected users section
      expect(screen.getByText('Utilisateurs sélectionnés (1)')).toBeInTheDocument();
    });

    it('should update invite button count when users selected', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      expect(screen.getByText('Inviter 1 utilisateur(s)')).toBeInTheDocument();
    });

    it('should remove user from selection when X is clicked', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select user
      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      // Find and click the remove button in the badge
      const badges = screen.getAllByTestId('badge');
      const johnBadge = badges.find(badge => badge.textContent?.includes('John Doe'));
      if (johnBadge) {
        const removeButton = johnBadge.querySelector('button');
        if (removeButton) {
          fireEvent.click(removeButton);
        }
      }

      expect(screen.getByText('Inviter 0 utilisateur(s)')).toBeInTheDocument();
    });

    it('should show "Selected" button for already selected users', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select user
      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      // The button should now say "Sélectionné"
      expect(screen.getByText('Sélectionné')).toBeInTheDocument();
    });
  });

  describe('Invite Functionality', () => {
    it('should invite selected users when invite button is clicked', async () => {
      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select user
      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      // Click invite
      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      await waitFor(() => {
        expect(apiService.post).toHaveBeenCalledWith(
          '/api/conversations/conv-1/invite',
          { userId: 'user-2' }
        );
      });
    });

    it('should call onUserInvited for each invited user', async () => {
      const onUserInvited = jest.fn();
      render(
        <InviteUserModal
          {...defaultProps}
          onUserInvited={onUserInvited}
        />
      );

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      await waitFor(() => {
        expect(onUserInvited).toHaveBeenCalled();
      });
    });

    it('should close modal after successful invite', async () => {
      const onClose = jest.fn();
      render(
        <InviteUserModal
          {...defaultProps}
          onClose={onClose}
        />
      );

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should show success toast after invite', async () => {
      const { toast } = require('sonner');

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should be disabled when no users selected', () => {
      render(<InviteUserModal {...defaultProps} />);

      const inviteButton = screen.getByText('Inviter 0 utilisateur(s)');
      expect(inviteButton).toBeDisabled();
    });

    it('should show loading state during invite', async () => {
      let resolveInvite: any;
      (apiService.post as jest.Mock).mockImplementation(
        () => new Promise((resolve) => { resolveInvite = resolve; })
      );

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      // Should show loading text
      expect(screen.getByText('Invitation en cours...')).toBeInTheDocument();

      // Resolve
      await act(async () => {
        resolveInvite({ data: { success: true } });
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when search fails', async () => {
      const { toast } = require('sonner');
      (apiService.get as jest.Mock).mockRejectedValue(new Error('Search failed'));

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should show error toast when invite fails', async () => {
      const { toast } = require('sonner');
      (apiService.post as jest.Mock).mockRejectedValue(new Error('Invite failed'));

      render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      const inviteButton = screen.getByText('Inviter 1 utilisateur(s)');
      fireEvent.click(inviteButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Cancel Button', () => {
    it('should call onClose when cancel button is clicked', () => {
      const onClose = jest.fn();
      render(<InviteUserModal {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByText('Annuler');
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should reset state when closed', async () => {
      const { rerender } = render(<InviteUserModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Rechercher des utilisateurs...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select user
      const userRow = screen.getByText('John Doe').closest('[class*="cursor-pointer"]');
      if (userRow) {
        fireEvent.click(userRow);
      }

      // Close and reopen
      const cancelButton = screen.getByText('Annuler');
      fireEvent.click(cancelButton);

      rerender(<InviteUserModal {...defaultProps} isOpen={true} />);

      // Selected users should be reset
      expect(screen.getByText('Inviter 0 utilisateur(s)')).toBeInTheDocument();
    });
  });
});
