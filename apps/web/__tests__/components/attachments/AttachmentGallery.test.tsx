/**
 * Tests for AttachmentGallery component
 * Modal gallery for viewing images and attachments
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentGallery } from '@/components/attachments/AttachmentGallery';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock i18n
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'gallery.titleWithCounter': `Image ${params?.current} of ${params?.total}`,
        'gallery.loading': 'Loading...',
        'gallery.noImage': 'No image',
        'gallery.fullscreen': 'Fullscreen',
        'gallery.download': 'Download',
        'gallery.close': 'Close',
        'gallery.previous': 'Previous',
        'gallery.next': 'Next',
        'gallery.goToMessage': 'Go to message',
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

// Mock AttachmentService
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    getConversationAttachments: jest.fn(),
    deleteAttachment: jest.fn(),
  },
}));

// Mock attachment URL utility
jest.mock('@/utils/attachment-url', () => ({
  buildAttachmentUrl: (url: string) =>
    url.startsWith('http') ? url : `https://example.com${url}`,
}));

// Create mock attachment helper
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `attachment-${Math.random().toString(36).substr(2, 9)}`,
  messageId: 'message-456',
  fileName: 'test-image.jpg',
  originalName: 'Test Image.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024000,
  fileUrl: 'https://example.com/images/test.jpg',
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
  width: 1920,
  height: 1080,
  ...overrides,
});

describe('AttachmentGallery', () => {
  const mockAttachments = [
    createMockAttachment({
      id: 'att-1',
      originalName: 'First.jpg',
      fileUrl: 'https://example.com/1.jpg',
    }),
    createMockAttachment({
      id: 'att-2',
      originalName: 'Second.jpg',
      fileUrl: 'https://example.com/2.jpg',
    }),
    createMockAttachment({
      id: 'att-3',
      originalName: 'Third.jpg',
      fileUrl: 'https://example.com/3.jpg',
    }),
  ];

  const defaultProps = {
    conversationId: 'conv-123',
    open: true,
    onClose: jest.fn(),
    attachments: mockAttachments,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when open is false', () => {
      render(<AttachmentGallery {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders gallery when open is true', () => {
      render(<AttachmentGallery {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays current image', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', 'https://example.com/1.jpg');
      });
    });

    it('displays loading state initially', () => {
      render(<AttachmentGallery {...defaultProps} attachments={undefined} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays attachment counter', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
      });
    });

    it('displays attachment filename', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('First.jpg')).toBeInTheDocument();
      });
    });

    it('displays attachment date', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        // Date should be formatted
        const dateElement = screen.getByText(/\d{1,2}.*\d{4}/);
        expect(dateElement).toBeInTheDocument();
      });
    });

    it('displays attachment dimensions', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to next image on next button click', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });

      const nextButton = screen.getByLabelText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
      });
    });

    it('navigates to previous image on previous button click', async () => {
      render(<AttachmentGallery {...defaultProps} initialAttachmentId="att-2" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
      });

      const prevButton = screen.getByLabelText('Previous');
      fireEvent.click(prevButton);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });
    });

    it('wraps to last image when clicking previous on first image', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });

      const prevButton = screen.getByLabelText('Previous');
      fireEvent.click(prevButton);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/3.jpg');
      });
    });

    it('wraps to first image when clicking next on last image', async () => {
      render(<AttachmentGallery {...defaultProps} initialAttachmentId="att-3" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/3.jpg');
      });

      const nextButton = screen.getByLabelText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to next image with ArrowRight', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
      });
    });

    it('navigates to previous image with ArrowLeft', async () => {
      render(<AttachmentGallery {...defaultProps} initialAttachmentId="att-2" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
      });

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });
    });

    it('closes gallery with Escape', async () => {
      const onClose = jest.fn();
      render(<AttachmentGallery {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Touch/Swipe Navigation', () => {
    it('navigates on swipe left', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });

      const container = screen.getByRole('img').closest('div');
      if (container) {
        fireEvent.touchStart(container, { touches: [{ clientX: 200 }] });
        fireEvent.touchMove(container, { touches: [{ clientX: 100 }] });
        fireEvent.touchEnd(container);

        await waitFor(() => {
          expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
        });
      }
    });

    it('navigates on swipe right', async () => {
      render(<AttachmentGallery {...defaultProps} initialAttachmentId="att-2" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
      });

      const container = screen.getByRole('img').closest('div');
      if (container) {
        fireEvent.touchStart(container, { touches: [{ clientX: 100 }] });
        fireEvent.touchMove(container, { touches: [{ clientX: 200 }] });
        fireEvent.touchEnd(container);

        await waitFor(() => {
          expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
        });
      }
    });

    it('ignores small swipes', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });

      const container = screen.getByRole('img').closest('div');
      if (container) {
        fireEvent.touchStart(container, { touches: [{ clientX: 100 }] });
        fireEvent.touchMove(container, { touches: [{ clientX: 120 }] }); // Only 20px movement
        fireEvent.touchEnd(container);

        // Should still be on first image
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      }
    });
  });

  describe('Actions', () => {
    it('opens fullscreen on fullscreen button click', async () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        const fullscreenButton = screen.getByTitle('Fullscreen');
        fireEvent.click(fullscreenButton);
      });

      expect(mockOpen).toHaveBeenCalledWith('https://example.com/1.jpg', '_blank');
    });

    it('downloads image on download button click', async () => {
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        const downloadButton = screen.getByTitle('Download');
        fireEvent.click(downloadButton);
      });

      expect(mockOpen).toHaveBeenCalledWith('https://example.com/1.jpg', '_blank');
    });
  });

  describe('Close', () => {
    it('calls onClose when close button is clicked', async () => {
      const onClose = jest.fn();
      render(<AttachmentGallery {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        const closeButton = screen.getByTitle('Close');
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Go to Message', () => {
    it('renders go to message button when callback provided', async () => {
      const onNavigateToMessage = jest.fn();
      render(
        <AttachmentGallery
          {...defaultProps}
          onNavigateToMessage={onNavigateToMessage}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Go to message')).toBeInTheDocument();
      });
    });

    it('does not render go to message button when callback not provided', async () => {
      render(<AttachmentGallery {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText('Go to message')).not.toBeInTheDocument();
      });
    });

    it('calls onNavigateToMessage with messageId', async () => {
      const onNavigateToMessage = jest.fn();
      const onClose = jest.fn();

      render(
        <AttachmentGallery
          {...defaultProps}
          onNavigateToMessage={onNavigateToMessage}
          onClose={onClose}
        />
      );

      await waitFor(() => {
        fireEvent.click(screen.getByText('Go to message'));
      });

      expect(onNavigateToMessage).toHaveBeenCalledWith('message-456');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Delete Attachment', () => {
    it('shows delete button when user owns attachment', async () => {
      render(
        <AttachmentGallery
          {...defaultProps}
          currentUserId="user-789"
          token="test-token"
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Supprimer')).toBeInTheDocument();
      });
    });

    it('hides delete button when user does not own attachment', async () => {
      render(
        <AttachmentGallery
          {...defaultProps}
          currentUserId="different-user"
          token="test-token"
        />
      );

      await waitFor(() => {
        expect(screen.queryByTitle('Supprimer')).not.toBeInTheDocument();
      });
    });

    it('shows confirmation dialog on delete click', async () => {
      render(
        <AttachmentGallery
          {...defaultProps}
          currentUserId="user-789"
          token="test-token"
        />
      );

      await waitFor(() => {
        fireEvent.click(screen.getByTitle('Supprimer'));
      });

      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument();
    });

    it('deletes attachment on confirmation', async () => {
      const { AttachmentService } = require('@/services/attachmentService');
      const { toast } = require('sonner');
      const onAttachmentDeleted = jest.fn();

      AttachmentService.deleteAttachment.mockResolvedValue({ success: true });

      render(
        <AttachmentGallery
          {...defaultProps}
          currentUserId="user-789"
          token="test-token"
          onAttachmentDeleted={onAttachmentDeleted}
        />
      );

      await waitFor(() => {
        fireEvent.click(screen.getByTitle('Supprimer'));
      });

      await act(async () => {
        const confirmButtons = screen.getAllByRole('button', { name: /supprimer/i });
        const confirmButton = confirmButtons.find((btn) => btn.textContent !== 'Suppression...');
        if (confirmButton) {
          fireEvent.click(confirmButton);
        }
      });

      await waitFor(() => {
        expect(AttachmentService.deleteAttachment).toHaveBeenCalledWith('att-1', 'test-token');
        expect(onAttachmentDeleted).toHaveBeenCalledWith('att-1');
        expect(toast.success).toHaveBeenCalledWith('Fichier supprime avec succes');
      });
    });

    it('cancels deletion on cancel click', async () => {
      const { AttachmentService } = require('@/services/attachmentService');

      render(
        <AttachmentGallery
          {...defaultProps}
          currentUserId="user-789"
          token="test-token"
        />
      );

      await waitFor(() => {
        fireEvent.click(screen.getByTitle('Supprimer'));
      });

      fireEvent.click(screen.getByText('Annuler'));

      expect(AttachmentService.deleteAttachment).not.toHaveBeenCalled();
      expect(screen.queryByText('Confirmer la suppression')).not.toBeInTheDocument();
    });
  });

  describe('Initial Attachment', () => {
    it('starts on specified initial attachment', async () => {
      render(
        <AttachmentGallery {...defaultProps} initialAttachmentId="att-2" />
      );

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/2.jpg');
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
      });
    });

    it('falls back to first attachment if initial not found', async () => {
      render(
        <AttachmentGallery {...defaultProps} initialAttachmentId="non-existent" />
      );

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
      });
    });
  });

  describe('API Loading', () => {
    it('loads attachments from API when not provided', async () => {
      const { AttachmentService } = require('@/services/attachmentService');
      AttachmentService.getConversationAttachments.mockResolvedValue({
        success: true,
        attachments: mockAttachments,
      });

      render(
        <AttachmentGallery
          conversationId="conv-123"
          open={true}
          onClose={jest.fn()}
          token="test-token"
        />
      );

      await waitFor(() => {
        expect(AttachmentService.getConversationAttachments).toHaveBeenCalledWith(
          'conv-123',
          { type: 'image', limit: 100 },
          'test-token'
        );
      });
    });
  });

  describe('No Images State', () => {
    it('displays no image message when no attachments', async () => {
      render(<AttachmentGallery {...defaultProps} attachments={[]} />);

      await waitFor(() => {
        expect(screen.getByText('No image')).toBeInTheDocument();
      });
    });
  });

  describe('Single Image', () => {
    it('hides navigation buttons for single image', async () => {
      const singleAttachment = [mockAttachments[0]];

      render(<AttachmentGallery {...defaultProps} attachments={singleAttachment} />);

      await waitFor(() => {
        expect(screen.queryByLabelText('Previous')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Next')).not.toBeInTheDocument();
      });
    });
  });
});
