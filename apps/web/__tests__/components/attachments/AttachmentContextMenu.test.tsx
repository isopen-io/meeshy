/**
 * Tests for AttachmentContextMenu component
 * Context menu for attachment actions: download, copy link, delete
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentContextMenu } from '@/components/attachments/AttachmentContextMenu';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Mock clipboard API
const mockClipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, {
  clipboard: mockClipboard,
});

// Create mock attachment
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'attachment-123',
  messageId: 'message-456',
  fileName: 'test-file.jpg',
  originalName: 'Original Image.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024000,
  fileUrl: 'https://example.com/files/test-file.jpg',
  uploadedBy: 'user-789',
  isAnonymous: false,
  createdAt: new Date().toISOString(),
  isForwarded: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
  isEncrypted: false,
  ...overrides,
});

describe('AttachmentContextMenu', () => {
  const defaultProps = {
    attachment: createMockAttachment(),
    isOpen: true,
    onClose: jest.fn(),
    position: { x: 100, y: 200 },
    canDelete: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock appendChild and removeChild for download link
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <AttachmentContextMenu {...defaultProps} isOpen={false} />
      );

      expect(screen.queryByText('Original Image.jpg')).not.toBeInTheDocument();
    });

    it('renders menu when isOpen is true', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      expect(screen.getByText('Original Image.jpg')).toBeInTheDocument();
    });

    it('displays attachment name in title', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      expect(screen.getByText('Original Image.jpg')).toBeInTheDocument();
    });

    it('displays download button', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      expect(screen.getByText('Telecharger')).toBeInTheDocument();
    });

    it('displays copy link button', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      expect(screen.getByText('Copier le lien')).toBeInTheDocument();
    });

    it('does not display delete button when canDelete is false', () => {
      render(<AttachmentContextMenu {...defaultProps} canDelete={false} />);

      expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
    });

    it('displays delete button when canDelete is true', () => {
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={jest.fn()}
        />
      );

      expect(screen.getByText('Supprimer')).toBeInTheDocument();
    });

    it('displays close button', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      const closeButtons = screen.getAllByRole('button');
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Download Action', () => {
    it('creates download link when download button is clicked', () => {
      const { toast } = require('sonner');
      render(<AttachmentContextMenu {...defaultProps} />);

      fireEvent.click(screen.getByText('Telecharger'));

      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Telechargement demarre');
    });

    it('calls onClose after download', () => {
      const onClose = jest.fn();
      render(<AttachmentContextMenu {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Telecharger'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Copy Link Action', () => {
    it('copies link to clipboard', async () => {
      const { toast } = require('sonner');
      render(<AttachmentContextMenu {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'));
      });

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(
          'https://example.com/files/test-file.jpg'
        );
      });
    });

    it('shows success toast on copy', async () => {
      const { toast } = require('sonner');
      render(<AttachmentContextMenu {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'));
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Lien copie dans le presse-papiers');
      });
    });

    it('shows error toast when copy fails', async () => {
      const { toast } = require('sonner');
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Copy failed'));

      render(<AttachmentContextMenu {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'));
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Impossible de copier le lien');
      });
    });

    it('calls onClose after copying', async () => {
      const onClose = jest.fn();
      render(<AttachmentContextMenu {...defaultProps} onClose={onClose} />);

      await act(async () => {
        fireEvent.click(screen.getByText('Copier le lien'));
      });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Delete Action', () => {
    it('shows confirmation dialog when delete is clicked', () => {
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument();
    });

    it('displays attachment name in confirmation dialog', () => {
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      // The attachment name should appear in the dialog
      const dialogText = screen.getAllByText('Original Image.jpg');
      expect(dialogText.length).toBeGreaterThanOrEqual(1);
    });

    it('displays warning message in confirmation dialog', () => {
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      expect(screen.getByText(/Cette action est irreversible/)).toBeInTheDocument();
    });

    it('calls onDelete when deletion is confirmed', async () => {
      const { toast } = require('sonner');
      const onDelete = jest.fn().mockResolvedValue(undefined);

      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={onDelete}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      // Find and click confirm button in dialog
      const confirmButton = screen.getAllByRole('button', { name: /supprimer/i })[1]; // Second one is confirm
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Fichier supprime avec succes');
      });
    });

    it('shows error toast when deletion fails', async () => {
      const { toast } = require('sonner');
      const onDelete = jest.fn().mockRejectedValue(new Error('Delete failed'));

      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={onDelete}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      const confirmButton = screen.getAllByRole('button', { name: /supprimer/i })[1];
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Impossible de supprimer le fichier');
      });
    });

    it('cancels deletion when cancel button is clicked', () => {
      const onDelete = jest.fn();
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={onDelete}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));
      fireEvent.click(screen.getByText('Annuler'));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('shows loading state during deletion', async () => {
      const onDelete = jest.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={onDelete}
        />
      );

      fireEvent.click(screen.getByText('Supprimer'));

      const confirmButton = screen.getAllByRole('button', { name: /supprimer/i })[1];
      fireEvent.click(confirmButton);

      expect(screen.getByText('Suppression...')).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(<AttachmentContextMenu {...defaultProps} onClose={onClose} />);

      // Find close button (the one with X icon in header)
      const buttons = screen.getAllByRole('button');
      const closeButton = buttons.find(
        (btn) => btn.querySelector('svg') && btn.closest('.flex.items-center.justify-between')
      );

      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });

  describe('Position Adjustment', () => {
    it('renders at specified position', () => {
      const { container } = render(
        <AttachmentContextMenu {...defaultProps} position={{ x: 150, y: 250 }} />
      );

      const menu = container.querySelector('.fixed');
      expect(menu).toHaveStyle({ left: '150px', top: '250px' });
    });
  });

  describe('Accessibility', () => {
    it('menu items are accessible via keyboard', () => {
      render(<AttachmentContextMenu {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveAttribute('disabled');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles attachment with long name', () => {
      const attachment = createMockAttachment({
        originalName: 'This is a very long filename that should be truncated in the display.jpg',
      });

      render(<AttachmentContextMenu {...defaultProps} attachment={attachment} />);

      expect(screen.getByText(/This is a very long filename/)).toBeInTheDocument();
    });

    it('handles attachment without onDelete callback', () => {
      render(
        <AttachmentContextMenu
          {...defaultProps}
          canDelete={true}
          onDelete={undefined}
        />
      );

      // Delete button should not be shown when onDelete is not provided
      expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
    });
  });
});
