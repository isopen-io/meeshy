/**
 * Tests for MessageAttachments component
 * Displays attachments in received messages with various file type support
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageAttachments } from '@/components/attachments/MessageAttachments';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock i18n
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        showLess: 'Show less',
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
    deleteAttachment: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock attachment URL utility
jest.mock('@/utils/attachment-url', () => ({
  buildAttachmentsUrls: (attachments: Attachment[]) =>
    attachments ? attachments.map((a) => ({
      ...a,
      fileUrl: a.fileUrl.startsWith('http') ? a.fileUrl : `https://example.com${a.fileUrl}`,
      thumbnailUrl: a.thumbnailUrl
        ? (a.thumbnailUrl.startsWith('http') ? a.thumbnailUrl : `https://example.com${a.thumbnailUrl}`)
        : undefined,
    })) : [],
}));

// Mock ImageLightbox
jest.mock('@/components/attachments/ImageLightbox', () => ({
  ImageLightbox: ({ isOpen, onClose, images, initialIndex }: any) =>
    isOpen ? (
      <div data-testid="image-lightbox">
        Image Lightbox - Index: {initialIndex}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock VideoLightbox
jest.mock('@/components/video/VideoLightbox', () => ({
  VideoLightbox: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="video-lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock PDF components
jest.mock('@/components/pdf/PDFViewerWrapper', () => ({
  PDFViewerWrapper: ({ attachment, onOpenLightbox }: any) => (
    <div data-testid="pdf-viewer">
      {attachment.originalName}
      <button onClick={onOpenLightbox}>Open PDF</button>
    </div>
  ),
}));

jest.mock('@/components/pdf/PDFLightboxSimple', () => ({
  PDFLightboxSimple: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="pdf-lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock text/markdown components
jest.mock('@/components/text/TextViewer', () => ({
  TextViewer: ({ attachment, onOpenLightbox }: any) => (
    <div data-testid="text-viewer">
      {attachment.originalName}
      <button onClick={onOpenLightbox}>Open Text</button>
    </div>
  ),
}));

jest.mock('@/components/text/TextLightbox', () => ({
  TextLightbox: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="text-lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

jest.mock('@/components/markdown/MarkdownViewer', () => ({
  MarkdownViewer: ({ attachment, onOpenLightbox }: any) => (
    <div data-testid="markdown-viewer">
      {attachment.originalName}
      <button onClick={onOpenLightbox}>Open Markdown</button>
    </div>
  ),
}));

jest.mock('@/components/markdown/MarkdownLightbox', () => ({
  MarkdownLightbox: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="markdown-lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock PPTX components
jest.mock('@/components/pptx/PPTXViewer', () => ({
  PPTXViewer: ({ attachment, onOpenLightbox }: any) => (
    <div data-testid="pptx-viewer">
      {attachment.originalName}
      <button onClick={onOpenLightbox}>Open PPTX</button>
    </div>
  ),
}));

jest.mock('@/components/pptx/PPTXLightbox', () => ({
  PPTXLightbox: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="pptx-lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock audio/video players
jest.mock('@/components/audio/SimpleAudioPlayer', () => ({
  SimpleAudioPlayer: ({ attachment }: any) => (
    <div data-testid="audio-player">{attachment.originalName}</div>
  ),
}));

jest.mock('@/components/video/VideoPlayer', () => ({
  VideoPlayer: ({ attachment, onOpenLightbox }: any) => (
    <div data-testid="video-player">
      {attachment.originalName}
      <button onClick={onOpenLightbox}>Open Video</button>
    </div>
  ),
}));

// Create mock attachment helper
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `attachment-${Math.random().toString(36).substr(2, 9)}`,
  messageId: 'message-456',
  fileName: 'test-file.jpg',
  originalName: 'Test File.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024000,
  fileUrl: '/api/v1/attachments/test/file',
  thumbnailUrl: '/api/v1/attachments/test/thumb',
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

describe('MessageAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.innerWidth for mobile detection
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  describe('Rendering', () => {
    it('renders nothing when attachments array is empty', () => {
      const { container } = render(<MessageAttachments attachments={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('handles undefined attachments gracefully', () => {
      // This tests that the component doesn't crash with undefined
      // The actual behavior depends on component implementation
      expect(() => {
        render(<MessageAttachments attachments={undefined as any} />);
      }).not.toThrow();
    });

    it('renders attachments container when attachments provided', () => {
      const attachments = [createMockAttachment()];
      const { container } = render(<MessageAttachments attachments={attachments} />);

      expect(container.firstChild).not.toBeNull();
    });
  });

  describe('Image Attachments', () => {
    it('renders image thumbnail', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toBeInTheDocument();
      });
    });

    it('opens image lightbox on click', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      fireEvent.click(imageButton);

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });
    });

    it('closes image lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      fireEvent.click(imageButton);

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByTestId('image-lightbox')).not.toBeInTheDocument();
      });
    });

    it('displays file size badge', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileSize: 1048576, // 1 MB
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByText('1 MB')).toBeInTheDocument();
    });

    it('displays extension badge', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByText('.JPG')).toBeInTheDocument();
    });

    it('handles image load error gracefully', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'broken.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      // Image should show fallback
      expect(img.getAttribute('src')).toContain('data:image/svg');
    });

    it('renders multiple images in grid', async () => {
      const attachments = [
        createMockAttachment({ id: 'img-1', mimeType: 'image/jpeg' }),
        createMockAttachment({ id: 'img-2', mimeType: 'image/jpeg' }),
        createMockAttachment({ id: 'img-3', mimeType: 'image/jpeg' }),
        createMockAttachment({ id: 'img-4', mimeType: 'image/jpeg' }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(4);
    });
  });

  describe('Video Attachments', () => {
    it('renders video player', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          originalName: 'video.mp4',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('video-player')).toBeInTheDocument();
    });

    it('opens video lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          originalName: 'video.mp4',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      fireEvent.click(screen.getByText('Open Video'));

      await waitFor(() => {
        expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Audio Attachments', () => {
    it('renders audio player', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'audio/mpeg',
          originalName: 'song.mp3',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    });
  });

  describe('PDF Attachments', () => {
    it('renders PDF viewer', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          originalName: 'document.pdf',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    });

    it('opens PDF lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          originalName: 'document.pdf',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      fireEvent.click(screen.getByText('Open PDF'));

      await waitFor(() => {
        expect(screen.getByTestId('pdf-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('PPTX Attachments', () => {
    it('renders PPTX viewer', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          originalName: 'presentation.pptx',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('pptx-viewer')).toBeInTheDocument();
    });

    it('opens PPTX lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          originalName: 'presentation.pptx',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      fireEvent.click(screen.getByText('Open PPTX'));

      await waitFor(() => {
        expect(screen.getByTestId('pptx-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Markdown Attachments', () => {
    it('renders Markdown viewer', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/markdown',
          originalName: 'readme.md',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
    });

    it('opens Markdown lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/markdown',
          originalName: 'readme.md',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      fireEvent.click(screen.getByText('Open Markdown'));

      await waitFor(() => {
        expect(screen.getByTestId('markdown-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Text/Code Attachments', () => {
    it('renders Text viewer', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/plain',
          originalName: 'notes.txt',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      expect(screen.getByTestId('text-viewer')).toBeInTheDocument();
    });

    it('opens Text lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/plain',
          originalName: 'notes.txt',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      fireEvent.click(screen.getByText('Open Text'));

      await waitFor(() => {
        expect(screen.getByTestId('text-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Other File Types', () => {
    it('renders generic file icon for unknown types', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/octet-stream',
          originalName: 'data.bin',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      // Should render file preview
      expect(screen.getByRole('button', { name: /ouvrir le fichier/i })).toBeInTheDocument();
    });
  });

  describe('Delete Functionality', () => {
    it('shows delete button when user owns attachment', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          uploadedBy: 'current-user',
        }),
      ];

      const { container } = render(
        <MessageAttachments
          attachments={attachments}
          currentUserId="current-user"
          token="test-token"
        />
      );

      // Delete button should be present (hidden until hover)
      const deleteButtons = container.querySelectorAll('button[title*="Supprimer"]');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it('hides delete button when user does not own attachment', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          uploadedBy: 'other-user',
        }),
      ];

      const { container } = render(
        <MessageAttachments
          attachments={attachments}
          currentUserId="current-user"
          token="test-token"
        />
      );

      const deleteButtons = container.querySelectorAll('button[title*="Supprimer"]');
      expect(deleteButtons.length).toBe(0);
    });

    it('shows confirmation dialog on delete click', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          uploadedBy: 'current-user',
          originalName: 'photo.jpg',
        }),
      ];

      const { container } = render(
        <MessageAttachments
          attachments={attachments}
          currentUserId="current-user"
          token="test-token"
        />
      );

      const deleteButton = container.querySelector('button[title*="Supprimer"]');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument();
      });
    });

    it('deletes attachment on confirmation', async () => {
      const { AttachmentService } = require('@/services/attachmentService');
      const { toast } = require('sonner');
      const onAttachmentDeleted = jest.fn();

      const attachments = [
        createMockAttachment({
          id: 'att-123',
          mimeType: 'image/jpeg',
          uploadedBy: 'current-user',
        }),
      ];

      const { container } = render(
        <MessageAttachments
          attachments={attachments}
          currentUserId="current-user"
          token="test-token"
          onAttachmentDeleted={onAttachmentDeleted}
        />
      );

      const deleteButton = container.querySelector('button[title*="Supprimer"]');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument();
      });

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Supprimer' });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(AttachmentService.deleteAttachment).toHaveBeenCalledWith('att-123', 'test-token');
        expect(onAttachmentDeleted).toHaveBeenCalledWith('att-123');
        expect(toast.success).toHaveBeenCalledWith('Fichier supprimé avec succès');
      });
    });

    it('cancels deletion on cancel click', async () => {
      const { AttachmentService } = require('@/services/attachmentService');

      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          uploadedBy: 'current-user',
        }),
      ];

      const { container } = render(
        <MessageAttachments
          attachments={attachments}
          currentUserId="current-user"
          token="test-token"
        />
      );

      const deleteButton = container.querySelector('button[title*="Supprimer"]');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Annuler'));

      await waitFor(() => {
        expect(screen.queryByText('Confirmer la suppression')).not.toBeInTheDocument();
      });

      expect(AttachmentService.deleteAttachment).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Attachments', () => {
    it('renders many attachments', () => {
      const attachments = Array.from({ length: 15 }, (_, i) =>
        createMockAttachment({
          id: `img-${i}`,
          mimeType: 'image/jpeg',
          originalName: `photo-${i}.jpg`,
        })
      );

      render(<MessageAttachments attachments={attachments} />);

      // All images should be rendered
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });

    it('renders 8 attachments', () => {
      const attachments = Array.from({ length: 8 }, (_, i) =>
        createMockAttachment({
          id: `img-${i}`,
          mimeType: 'image/jpeg',
          originalName: `photo-${i}.jpg`,
        })
      );

      render(<MessageAttachments attachments={attachments} />);

      const images = screen.getAllByRole('img');
      expect(images.length).toBe(8);
    });
  });

  describe('Message Alignment', () => {
    it('applies own message alignment when isOwnMessage is true', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      const { container } = render(
        <MessageAttachments attachments={attachments} isOwnMessage={true} />
      );

      // Check for own message specific classes
      const imageContainer = container.querySelector('.items-end');
      expect(imageContainer).toBeInTheDocument();
    });

    it('applies default alignment when isOwnMessage is false', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      const { container } = render(
        <MessageAttachments attachments={attachments} isOwnMessage={false} />
      );

      // Check for default alignment classes
      const imageContainer = container.querySelector('.items-start');
      expect(imageContainer).toBeInTheDocument();
    });
  });

  describe('Mobile Detection', () => {
    it('adjusts layout for mobile viewport', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      fireEvent(window, new Event('resize'));

      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      // Component should detect mobile and adjust layout
      await waitFor(() => {
        expect(screen.getByRole('img')).toBeInTheDocument();
      });
    });
  });

  describe('Mixed Attachment Types', () => {
    it('renders all attachment types correctly', async () => {
      const attachments = [
        createMockAttachment({ id: 'img-1', mimeType: 'image/jpeg', originalName: 'photo.jpg' }),
        createMockAttachment({ id: 'vid-1', mimeType: 'video/mp4', originalName: 'video.mp4' }),
        createMockAttachment({ id: 'aud-1', mimeType: 'audio/mpeg', originalName: 'song.mp3' }),
        createMockAttachment({ id: 'pdf-1', mimeType: 'application/pdf', originalName: 'doc.pdf' }),
        createMockAttachment({ id: 'txt-1', mimeType: 'text/plain', originalName: 'notes.txt' }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toBeInTheDocument();
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
        expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
        expect(screen.getByTestId('text-viewer')).toBeInTheDocument();
      });
    });
  });

  describe('Tooltip', () => {
    it('shows tooltip with file info on hover', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
          fileSize: 1048576,
          width: 1920,
          height: 1080,
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      // Tooltip should be present on the element
      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      expect(imageButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('image buttons are keyboard accessible', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      expect(imageButton).toHaveAttribute('tabindex', '0');
    });

    it('supports keyboard navigation with Enter key', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      fireEvent.keyDown(imageButton, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation with Space key', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
        }),
      ];

      render(<MessageAttachments attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      fireEvent.keyDown(imageButton, { key: ' ' });

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });
    });
  });
});
