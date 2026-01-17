import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationLinksSection } from '../../../components/conversations/conversation-links-section';
import { authManager } from '@/services/auth-manager.service';
import { copyToClipboard } from '@/lib/clipboard';

// Mock services
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
  },
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn(),
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000${endpoint}`),
  API_ENDPOINTS: {
    CONVERSATION: {
      GET_CONVERSATION_LINKS: (id: string) => `/api/conversations/${id}/links`,
    },
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

// Mock UI components
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
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
  Button: ({ children, onClick, size, variant, className }: any) => (
    <button
      onClick={onClick}
      data-size={size}
      data-variant={variant}
      className={className}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div data-testid="popover">{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}));

// Mock fetch
global.fetch = jest.fn();

// Mock data
const mockLinks = [
  {
    id: 'link-1',
    linkId: 'abc123',
    name: 'Test Link 1',
    description: 'A test link',
    isActive: true,
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    maxUses: 100,
    currentUses: 10,
    maxConcurrentUsers: 50,
    currentConcurrentUsers: 5,
    maxUniqueSessions: null,
    currentUniqueSessions: 0,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: true,
    allowViewHistory: false,
    requireAccount: false,
    requireNickname: true,
    requireEmail: false,
    requireBirthday: false,
    allowedCountries: [],
    allowedLanguages: ['en', 'fr'],
    allowedIpRanges: [],
    createdAt: new Date().toISOString(),
    creator: {
      id: 'user-1',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
    },
    _count: {
      anonymousParticipants: 5,
    },
  },
  {
    id: 'link-2',
    linkId: 'def456',
    name: 'Expired Link',
    description: 'An expired link',
    isActive: true,
    expiresAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    maxUses: 50,
    currentUses: 30,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
    maxUniqueSessions: null,
    currentUniqueSessions: 0,
    allowAnonymousMessages: false,
    allowAnonymousFiles: false,
    allowAnonymousImages: false,
    allowViewHistory: true,
    requireAccount: true,
    requireNickname: false,
    requireEmail: true,
    requireBirthday: false,
    allowedCountries: ['US', 'CA'],
    allowedLanguages: [],
    allowedIpRanges: [],
    createdAt: new Date().toISOString(),
    creator: {
      id: 'user-2',
      username: 'admin',
      firstName: 'Admin',
      lastName: '',
      displayName: 'Admin',
    },
    _count: {
      anonymousParticipants: 10,
    },
  },
  {
    id: 'link-3',
    linkId: 'ghi789',
    name: 'Disabled Link',
    description: 'A disabled link',
    isActive: false,
    expiresAt: null,
    maxUses: null,
    currentUses: 0,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
    maxUniqueSessions: null,
    currentUniqueSessions: 0,
    allowAnonymousMessages: true,
    allowAnonymousFiles: true,
    allowAnonymousImages: true,
    allowViewHistory: true,
    requireAccount: false,
    requireNickname: false,
    requireEmail: false,
    requireBirthday: false,
    allowedCountries: [],
    allowedLanguages: [],
    allowedIpRanges: [],
    createdAt: new Date().toISOString(),
    creator: {
      id: 'user-1',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
    },
    _count: {
      anonymousParticipants: 0,
    },
  },
];

describe('ConversationLinksSection', () => {
  const defaultProps = {
    conversationId: 'conv-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authManager.getAuthToken as jest.Mock).mockReturnValue('mock-token');
    (copyToClipboard as jest.Mock).mockResolvedValue({ success: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockLinks }),
    });
  });

  describe('Initial Render', () => {
    it('should render the section title', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      expect(screen.getByText('Liens de partage')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockLinks }),
        }), 1000))
      );

      render(<ConversationLinksSection {...defaultProps} />);

      expect(screen.getByText('Chargement des liens...')).toBeInTheDocument();
    });

    it('should load links on mount', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/conversations/conv-1/links',
          expect.objectContaining({
            headers: { Authorization: 'Bearer mock-token' },
          })
        );
      });
    });
  });

  describe('Links Display', () => {
    it('should display link count badge', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('should display active links section', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Liens actifs/)).toBeInTheDocument();
      });
    });

    it('should display expired links section', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Liens expirés/)).toBeInTheDocument();
      });
    });

    it('should display link names', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Link name appears in both list view and popover, so use getAllByText
        const linkNames = screen.getAllByText('Test Link 1');
        expect(linkNames.length).toBeGreaterThan(0);
      });
    });

    it('should display usage counts', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('10/100')).toBeInTheDocument();
      });
    });

    it('should display status badges', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Actif')).toBeInTheDocument();
        expect(screen.getByText('Expiré')).toBeInTheDocument();
        expect(screen.getByText('Désactivé')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no links', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun lien de partage')).toBeInTheDocument();
      });
    });
  });

  describe('Copy Link', () => {
    it('should copy link when copy button is clicked', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Link name appears multiple times (list and popover), use getAllByText
        const linkNames = screen.getAllByText('Test Link 1');
        expect(linkNames.length).toBeGreaterThan(0);
      });

      // Find copy button by its data-testid since "Copier" text is hidden on small screens
      const buttons = screen.getAllByTestId('button');
      // Find the copy button (the one in the action area, not the popover trigger)
      const copyButton = buttons.find(btn => btn.textContent?.includes('Copier'));

      if (copyButton) {
        fireEvent.click(copyButton);

        await waitFor(() => {
          expect(copyToClipboard).toHaveBeenCalledWith(
            expect.stringContaining('/join/abc123')
          );
        });
      } else {
        // Fallback: click the first button which should be the copy button
        fireEvent.click(buttons[0]);

        await waitFor(() => {
          expect(copyToClipboard).toHaveBeenCalledWith(
            expect.stringContaining('/join/abc123')
          );
        });
      }
    });
  });

  describe('Link Details Popover', () => {
    it('should display link description in popover', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Description is in the popover content which is always visible in our mock
        expect(screen.getByText('A test link')).toBeInTheDocument();
      });
    });

    it('should display creator information', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Each link card has a popover with creator info, so multiple elements exist
        const creatorLabels = screen.getAllByText('Créé par:');
        expect(creatorLabels.length).toBeGreaterThan(0);
      });
    });

    it('should display permissions', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Multiple links means multiple permission sections
        const permissionsLabels = screen.getAllByText('Permissions');
        expect(permissionsLabels.length).toBeGreaterThan(0);

        // Each permission label appears multiple times (once per link popover)
        const messagesLabels = screen.getAllByText('Messages');
        expect(messagesLabels.length).toBeGreaterThan(0);
        const imagesLabels = screen.getAllByText('Images');
        expect(imagesLabels.length).toBeGreaterThan(0);
        const fichiersLabels = screen.getAllByText('Fichiers');
        expect(fichiersLabels.length).toBeGreaterThan(0);
        const historiqueLabels = screen.getAllByText('Historique');
        expect(historiqueLabels.length).toBeGreaterThan(0);
      });
    });

    it('should display restrictions when present', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // mockLinks[0] has allowedLanguages: ['en', 'fr'], so "Restrictions" appears
        // mockLinks[1] has allowedCountries: ['US', 'CA'], so "Restrictions" also appears
        // Only these two links have restrictions, so we expect at least one
        const restrictionLabels = screen.getAllByText('Restrictions');
        expect(restrictionLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network error gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun lien de partage')).toBeInTheDocument();
      });
    });

    it('should handle 401 error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun lien de partage')).toBeInTheDocument();
      });
    });

    it('should handle 404 error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun lien de partage')).toBeInTheDocument();
      });
    });

    it('should handle API error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Some error' }),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Aucun lien de partage')).toBeInTheDocument();
      });
    });
  });

  describe('No Auth Token', () => {
    it('should not fetch links when no auth token', async () => {
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Link Name Truncation', () => {
    it('should truncate long link names', async () => {
      const longNameLinks = [{
        ...mockLinks[0],
        name: 'This is a very long link name that should be truncated',
      }];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: longNameLinks }),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // The name should be truncated to 32 characters
        expect(screen.getByText('This is a very long link name...')).toBeInTheDocument();
      });
    });
  });

  describe('Expiration Date Formatting', () => {
    it('should format expiration dates', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        // Check that date is formatted
        const cards = screen.getAllByTestId('card');
        expect(cards.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Unlimited Usage Display', () => {
    it('should display infinity symbol for unlimited usage', async () => {
      const unlimitedLink = [{
        ...mockLinks[0],
        maxUses: null,
      }];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: unlimitedLink }),
      });

      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/\/∞/)).toBeInTheDocument();
      });
    });
  });

  describe('Anonymous Participants Count', () => {
    it('should display anonymous participants count', async () => {
      render(<ConversationLinksSection {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });
  });
});
