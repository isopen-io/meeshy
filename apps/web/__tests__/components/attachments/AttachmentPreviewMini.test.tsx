/**
 * Tests for AttachmentPreviewMini component
 * Compact preview component for attachments in quoted messages
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentPreviewMini } from '@/components/attachments/AttachmentPreviewMini';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock buildAttachmentsUrls utility
jest.mock('@/utils/attachment-url', () => ({
  buildAttachmentsUrls: (attachments: Attachment[]) =>
    attachments.map((a) => ({
      ...a,
      fileUrl: a.fileUrl.startsWith('http') ? a.fileUrl : `https://example.com${a.fileUrl}`,
    })),
}));

// Create mock attachment helper
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `attachment-${Math.random().toString(36).substr(2, 9)}`,
  messageId: 'message-456',
  fileName: 'test-file.jpg',
  originalName: 'test-file.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  fileUrl: '/api/v1/attachments/test/file',
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

describe('AttachmentPreviewMini', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when attachments array is empty', () => {
      const { container } = render(<AttachmentPreviewMini attachments={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders attachment preview for single attachment', () => {
      const attachments = [createMockAttachment()];
      render(<AttachmentPreviewMini attachments={attachments} />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
    });

    it('renders all attachments when showOnlyFirst is false', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
        createMockAttachment({ id: '3' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} showOnlyFirst={false} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(3);
    });

    it('renders only first attachment when showOnlyFirst is true', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
        createMockAttachment({ id: '3' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} showOnlyFirst={true} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(1);
    });

    it('shows remaining count badge when showOnlyFirst is true with multiple attachments', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
        createMockAttachment({ id: '3' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} showOnlyFirst={true} />);

      expect(screen.getByText('+2')).toBeInTheDocument();
    });
  });

  describe('Image Attachments', () => {
    it('renders image thumbnail for image attachments', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
      expect(img).toHaveAttribute('alt', /photo.jpg/);
    });

    it('handles image load error gracefully', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/broken.jpg',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      // Image should be hidden after error
      expect(img).toHaveStyle({ display: 'none' });
    });

    it('renders image with lazy loading', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/png',
          fileUrl: 'https://example.com/image.png',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });
  });

  describe('Video Attachments', () => {
    it('renders video icon and filename for video attachments', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
          originalName: 'video.mp4',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByText('video.mp4')).toBeInTheDocument();
    });

    it('truncates long video filenames', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'this-is-a-very-long-video-filename-that-should-be-truncated.mp4',
        }),
      ];

      const { container } = render(<AttachmentPreviewMini attachments={attachments} />);

      const fileNameElement = container.querySelector('.truncate');
      expect(fileNameElement).toBeInTheDocument();
    });

    it('has proper aria-label for video', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'movie.mp4',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByLabelText(/Fichier video : movie.mp4/i)).toBeInTheDocument();
    });
  });

  describe('Audio Attachments', () => {
    it('renders audio icon and filename for audio attachments', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'audio/mpeg',
          fileName: 'song.mp3',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByText('song.mp3')).toBeInTheDocument();
    });

    it('has proper aria-label for audio', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'audio/wav',
          fileName: 'audio.wav',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByLabelText(/Fichier audio : audio.wav/i)).toBeInTheDocument();
    });
  });

  describe('PDF Attachments', () => {
    it('renders PDF icon and filename', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'document.pdf',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('has proper aria-label for PDF', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByLabelText(/Document PDF : report.pdf/i)).toBeInTheDocument();
    });
  });

  describe('Other File Types', () => {
    it('renders generic file icon for unknown types', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/octet-stream',
          fileName: 'data.bin',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByText('data.bin')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom className', () => {
      const attachments = [createMockAttachment()];
      const { container } = render(
        <AttachmentPreviewMini attachments={attachments} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('uses owner message styling when isOwnMessage is true', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
        }),
      ];

      const { container } = render(
        <AttachmentPreviewMini attachments={attachments} isOwnMessage={true} />
      );

      // Owner messages have white/light styling
      const filePreview = container.querySelector('.bg-white\\/10');
      expect(filePreview).toBeInTheDocument();
    });

    it('uses default styling when isOwnMessage is false', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
        }),
      ];

      const { container } = render(
        <AttachmentPreviewMini attachments={attachments} isOwnMessage={false} />
      );

      // Default has gray background
      const filePreview = container.querySelector('.bg-gray-100');
      expect(filePreview).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper list role', () => {
      const attachments = [createMockAttachment()];
      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('has proper aria-label for list', () => {
      const attachments = [createMockAttachment()];
      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByLabelText(/piece jointe/i)).toBeInTheDocument();
    });

    it('handles plural aria-label for multiple attachments', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      expect(screen.getByLabelText(/pieces jointes/i)).toBeInTheDocument();
    });

    it('has proper list items', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(2);
    });

    it('remaining count badge has proper aria-label', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
        createMockAttachment({ id: '3' }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} showOnlyFirst={true} />);

      expect(screen.getByLabelText(/et 2 autres pieces jointes/i)).toBeInTheDocument();
    });
  });

  describe('URL Validation', () => {
    it('renders image when URL is valid', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/valid.jpg',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('handles data URLs', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      // Component should render since data: URLs are valid
      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });

  describe('Read-only Arrays', () => {
    it('handles readonly attachment arrays', () => {
      const attachments: readonly Attachment[] = Object.freeze([
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
      ]);

      render(<AttachmentPreviewMini attachments={attachments} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles attachment with empty fileUrl', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: '',
        }),
      ];

      render(<AttachmentPreviewMini attachments={attachments} />);

      // Should not render image without valid URL
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('handles attachment with null-like values', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
          fileUrl: '/api/v1/attachments/test',
        }),
      ];

      // Should not throw
      expect(() => render(<AttachmentPreviewMini attachments={attachments} />)).not.toThrow();
    });
  });
});
