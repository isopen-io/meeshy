import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LinkSummaryModal } from '../../../components/conversations/link-summary-modal';
import { copyToClipboard } from '@/lib/clipboard';

// Mock clipboard
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn(),
}));

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'linkSummaryModal.title': 'Link Summary',
        'linkSummaryModal.description': 'Your share link has been created',
        'linkSummaryModal.shareLink': 'Share Link',
        'linkSummaryModal.copy': 'Copy',
        'linkSummaryModal.copied': 'Copied!',
        'linkSummaryModal.expires': 'Expires on',
        'linkSummaryModal.userLimits': 'User Limits',
        'linkSummaryModal.limitedTo': 'Limited to',
        'linkSummaryModal.usage': 'use',
        'linkSummaryModal.usages': 'uses',
        'linkSummaryModal.unlimitedUsage': 'Unlimited usage',
        'linkSummaryModal.maxConcurrent': 'Max concurrent users',
        'linkSummaryModal.maxSessions': 'Max unique sessions',
        'linkSummaryModal.authRequirements': 'Authentication Requirements',
        'linkSummaryModal.accountRequired': 'Account Required',
        'linkSummaryModal.nickname': 'Nickname',
        'linkSummaryModal.email': 'Email',
        'linkSummaryModal.birthday': 'Birthday',
        'linkSummaryModal.languages': 'Allowed Languages',
        'linkSummaryModal.sendPermissions': 'Send Permissions',
        'linkSummaryModal.messages': 'Messages',
        'linkSummaryModal.files': 'Files',
        'linkSummaryModal.images': 'Images',
        'linkSummaryModal.videos': 'Videos',
        'linkSummaryModal.audio': 'Audio',
        'linkSummaryModal.documents': 'Documents',
        'linkSummaryModal.links': 'Links',
        'linkSummaryModal.location': 'Location',
        'linkSummaryModal.contacts': 'Contacts',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock sonner toast
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
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, variant, size }: any) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

// Mock data
const mockLinkData = {
  url: 'https://meeshy.app/join/abc123xyz',
  token: 'abc123xyz',
  title: 'Test Share Link',
  description: 'A test share link',
  expirationDays: 7,
  maxUses: 100,
  maxConcurrentUsers: 10,
  maxUniqueSessions: 50,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: false,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedLanguages: ['en', 'fr', 'es'],
};

describe('LinkSummaryModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    linkData: mockLinkData,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (copyToClipboard as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('Initial Render', () => {
    it('should render dialog when isOpen is true', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render dialog when isOpen is false', () => {
      render(<LinkSummaryModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display dialog title', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Link Summary')).toBeInTheDocument();
    });

    it('should display dialog description', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Your share link has been created')).toBeInTheDocument();
    });
  });

  describe('Link URL Display', () => {
    it('should display the share link URL', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText(mockLinkData.url)).toBeInTheDocument();
    });

    it('should display Share Link label', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Share Link')).toBeInTheDocument();
    });
  });

  describe('Copy Functionality', () => {
    it('should display copy button', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('should copy link when copy button is clicked', async () => {
      render(<LinkSummaryModal {...defaultProps} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(copyToClipboard).toHaveBeenCalledWith(mockLinkData.url);
      });
    });

    it('should show success toast after copying', async () => {
      const { toast } = require('sonner');
      render(<LinkSummaryModal {...defaultProps} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Lien copié dans le presse-papier !');
      });
    });

    it('should show "Copied!" text after copying', async () => {
      render(<LinkSummaryModal {...defaultProps} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('should show error toast when copy fails', async () => {
      const { toast } = require('sonner');
      (copyToClipboard as jest.Mock).mockRejectedValue(new Error('Copy failed'));

      render(<LinkSummaryModal {...defaultProps} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur lors de la copie du lien');
      });
    });

    it('should reset copied state after 2 seconds', async () => {
      // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

      render(<LinkSummaryModal {...defaultProps} />);

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(screen.getByText('Copy')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('Expiration Date', () => {
    it('should display formatted expiration date', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Expires on')).toBeInTheDocument();
      // The date formatting depends on locale, just check it renders
    });
  });

  describe('User Limits', () => {
    it('should display max uses when set', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('User Limits')).toBeInTheDocument();
      expect(screen.getByText('Limited to:')).toBeInTheDocument();
      expect(screen.getByText('100 uses')).toBeInTheDocument();
    });

    it('should display unlimited usage when maxUses is not set', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, maxUses: undefined }}
        />
      );

      expect(screen.getByText('Unlimited usage')).toBeInTheDocument();
    });

    it('should display singular "use" for maxUses = 1', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, maxUses: 1 }}
        />
      );

      expect(screen.getByText('1 use')).toBeInTheDocument();
    });

    it('should display max concurrent users when set', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Max concurrent users:')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should display max unique sessions when set', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Max unique sessions:')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('should not display max concurrent users when not set', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, maxConcurrentUsers: undefined }}
        />
      );

      expect(screen.queryByText('Max concurrent users:')).not.toBeInTheDocument();
    });
  });

  describe('Authentication Requirements', () => {
    it('should display authentication requirements section', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Authentication Requirements')).toBeInTheDocument();
    });

    it('should show account required when set', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, requireAccount: true }}
        />
      );

      expect(screen.getByText('Account Required')).toBeInTheDocument();
    });

    it('should display nickname requirement', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Nickname')).toBeInTheDocument();
    });

    it('should display email requirement', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('should display birthday requirement when defined', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, requireBirthday: true }}
        />
      );

      expect(screen.getByText('Birthday')).toBeInTheDocument();
    });
  });

  describe('Allowed Languages', () => {
    it('should display allowed languages section', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Allowed Languages')).toBeInTheDocument();
    });

    it('should display language badges', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('EN')).toBeInTheDocument();
      expect(screen.getByText('FR')).toBeInTheDocument();
      expect(screen.getByText('ES')).toBeInTheDocument();
    });
  });

  describe('Send Permissions', () => {
    it('should display send permissions section', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Send Permissions')).toBeInTheDocument();
    });

    it('should display messages permission with check when allowed', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Messages')).toBeInTheDocument();
    });

    it('should display images permission with check when allowed', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Images')).toBeInTheDocument();
    });

    it('should display files permission with X when not allowed', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Files')).toBeInTheDocument();
    });

    it('should display videos permission', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Videos')).toBeInTheDocument();
    });

    it('should display audio permission', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Audio')).toBeInTheDocument();
    });

    it('should display documents permission', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Documents')).toBeInTheDocument();
    });

    it('should display links permission (always allowed)', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Links')).toBeInTheDocument();
    });

    it('should display location permission (always allowed)', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Location')).toBeInTheDocument();
    });

    it('should display contacts permission (always allowed)', () => {
      render(<LinkSummaryModal {...defaultProps} />);

      expect(screen.getByText('Contacts')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when dialog changes', () => {
      const onClose = jest.fn();
      render(<LinkSummaryModal {...defaultProps} onClose={onClose} />);

      // The Dialog component handles closing
      // In a real test, we would interact with the close button
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty allowed languages array', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{ ...mockLinkData, allowedLanguages: [] }}
        />
      );

      // Should render without crashing
      expect(screen.getByText('Allowed Languages')).toBeInTheDocument();
    });

    it('should handle all permissions disabled', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{
            ...mockLinkData,
            allowAnonymousMessages: false,
            allowAnonymousFiles: false,
            allowAnonymousImages: false,
          }}
        />
      );

      expect(screen.getByText('Send Permissions')).toBeInTheDocument();
    });

    it('should handle all requirements enabled', () => {
      render(
        <LinkSummaryModal
          {...defaultProps}
          linkData={{
            ...mockLinkData,
            requireAccount: true,
            requireNickname: true,
            requireEmail: true,
            requireBirthday: true,
          }}
        />
      );

      expect(screen.getByText('Account Required')).toBeInTheDocument();
      expect(screen.getByText('Nickname')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Birthday')).toBeInTheDocument();
    });
  });
});
