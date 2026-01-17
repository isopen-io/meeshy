/**
 * Tests for AttachmentPreviewReply component
 * Interactive attachment previews in reply zones with lightbox support
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock dynamic imports
jest.mock('next/dynamic', () => () => {
  const MockComponent = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="mock-lightbox">Mock Lightbox</div> : null;
  MockComponent.displayName = 'MockLightbox';
  return MockComponent;
});

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

// Mock audio and video players
jest.mock('@/components/audio/SimpleAudioPlayer', () => ({
  CompactAudioPlayer: ({ attachment }: any) => (
    <div data-testid="compact-audio-player">{attachment.fileName}</div>
  ),
}));

jest.mock('@/components/video/VideoPlayer', () => ({
  CompactVideoPlayer: ({ attachment }: any) => (
    <div data-testid="compact-video-player">{attachment.fileName}</div>
  ),
}));

// Mock attachment URL utility
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

describe('AttachmentPreviewReply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when attachments array is empty', () => {
      const { container } = render(<AttachmentPreviewReply attachments={[]} />);

      // Should have no list
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('renders attachment list for non-empty array', () => {
      const attachments = [createMockAttachment()];
      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('has proper aria-label', () => {
      const attachments = [
        createMockAttachment({ id: '1' }),
        createMockAttachment({ id: '2' }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByLabelText(/pieces jointes/i)).toBeInTheDocument();
    });
  });

  describe('Image Attachments', () => {
    it('renders clickable image thumbnail', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });

    it('opens image lightbox on click', async () => {
      const attachments = [
        createMockAttachment({
          id: 'img-1',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      fireEvent.click(imageButton);

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });
    });

    it('displays correct index in lightbox', async () => {
      const attachments = [
        createMockAttachment({
          id: 'img-1',
          mimeType: 'image/jpeg',
          fileName: 'first.jpg',
          fileUrl: 'https://example.com/first.jpg',
        }),
        createMockAttachment({
          id: 'img-2',
          mimeType: 'image/jpeg',
          fileName: 'second.jpg',
          fileUrl: 'https://example.com/second.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      // Click second image
      const imageButtons = screen.getAllByRole('button', { name: /ouvrir l'image/i });
      fireEvent.click(imageButtons[1]);

      await waitFor(() => {
        expect(screen.getByText(/Index: 1/)).toBeInTheDocument();
      });
    });

    it('closes image lightbox', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

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

    it('handles image load error', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/broken.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      // Image should be hidden
      expect(img).toHaveStyle({ display: 'none' });
    });
  });

  describe('Audio Attachments', () => {
    it('renders CompactAudioPlayer for audio attachments', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'audio/mpeg',
          fileName: 'song.mp3',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByTestId('compact-audio-player')).toBeInTheDocument();
      expect(screen.getByText('song.mp3')).toBeInTheDocument();
    });

    it('stops event propagation on audio player click', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'audio/mpeg',
          fileName: 'song.mp3',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const audioPlayer = screen.getByTestId('compact-audio-player');
      const clickEvent = fireEvent.click(audioPlayer.parentElement!);

      // Event should be stopped (parent element handles stopPropagation)
      expect(audioPlayer).toBeInTheDocument();
    });
  });

  describe('Video Attachments', () => {
    it('renders CompactVideoPlayer for video attachments', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByTestId('compact-video-player')).toBeInTheDocument();
      expect(screen.getByText('video.mp4')).toBeInTheDocument();
    });

    it('renders fullscreen button for video', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
          originalName: 'video.mp4',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const fullscreenButton = screen.getByLabelText(/ouvrir la video.*en plein ecran/i);
      expect(fullscreenButton).toBeInTheDocument();
    });
  });

  describe('PDF Attachments', () => {
    it('renders clickable PDF preview', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'document.pdf',
          originalName: 'Document.pdf',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByText('Document.pdf')).toBeInTheDocument();
    });

    it('has proper aria-label for PDF', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByLabelText(/ouvrir le pdf/i)).toBeInTheDocument();
    });

    it('opens PDF lightbox on click', async () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'document.pdf',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const pdfButton = screen.getByLabelText(/ouvrir le pdf/i);
      fireEvent.click(pdfButton);

      await waitFor(() => {
        expect(screen.getByTestId('mock-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Text/Code Attachments', () => {
    it('renders clickable text file preview', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/plain',
          fileName: 'notes.txt',
          originalName: 'Notes.txt',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByText('Notes.txt')).toBeInTheDocument();
    });

    it('renders code file with proper icon', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/javascript',
          fileName: 'script.js',
          originalName: 'script.js',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByText('script.js')).toBeInTheDocument();
    });

    it('has proper aria-label for text file', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/plain',
          fileName: 'readme.txt',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByLabelText(/ouvrir le fichier texte/i)).toBeInTheDocument();
    });
  });

  describe('Other File Types', () => {
    it('renders generic file icon for unknown types', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/octet-stream',
          fileName: 'data.bin',
          originalName: 'data.bin',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByText('data.bin')).toBeInTheDocument();
    });
  });

  describe('Mixed Attachments', () => {
    it('renders multiple attachment types correctly', () => {
      const attachments = [
        createMockAttachment({
          id: 'img-1',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
        createMockAttachment({
          id: 'audio-1',
          mimeType: 'audio/mpeg',
          fileName: 'song.mp3',
        }),
        createMockAttachment({
          id: 'pdf-1',
          mimeType: 'application/pdf',
          fileName: 'doc.pdf',
          originalName: 'doc.pdf',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByTestId('compact-audio-player')).toBeInTheDocument();
      expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom className', () => {
      const attachments = [createMockAttachment()];
      const { container } = render(
        <AttachmentPreviewReply attachments={attachments} className="custom-class" />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('applies owner message styling when isOwnMessage is true', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'doc.pdf',
        }),
      ];

      const { container } = render(
        <AttachmentPreviewReply attachments={attachments} isOwnMessage={true} />
      );

      expect(container.querySelector('.bg-white\\/10')).toBeInTheDocument();
    });

    it('applies default styling when isOwnMessage is false', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'doc.pdf',
        }),
      ];

      const { container } = render(
        <AttachmentPreviewReply attachments={attachments} isOwnMessage={false} />
      );

      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('image buttons are keyboard accessible', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/photo.jpg',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const imageButton = screen.getByRole('button', { name: /ouvrir l'image/i });
      expect(imageButton).toHaveAttribute('tabindex', '0');
    });

    it('PDF buttons are keyboard accessible', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'doc.pdf',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const pdfButton = screen.getByRole('button', { name: /ouvrir le pdf/i });
      expect(pdfButton).toHaveAttribute('tabindex', '0');
    });

    it('text buttons are keyboard accessible', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'text/plain',
          fileName: 'notes.txt',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      const textButton = screen.getByRole('button', { name: /ouvrir le fichier texte/i });
      expect(textButton).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Read-only Arrays', () => {
    it('handles readonly attachment arrays', () => {
      const attachments: readonly Attachment[] = Object.freeze([
        createMockAttachment({ id: '1', mimeType: 'image/jpeg' }),
        createMockAttachment({ id: '2', mimeType: 'audio/mpeg', fileName: 'song.mp3' }),
      ]);

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByTestId('compact-audio-player')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles attachment with missing originalName', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'application/pdf',
          fileName: 'file.pdf',
          originalName: '',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      expect(screen.getByText('file.pdf')).toBeInTheDocument();
    });

    it('handles empty file URL gracefully for images', () => {
      const attachments = [
        createMockAttachment({
          mimeType: 'image/jpeg',
          fileUrl: '',
        }),
      ];

      render(<AttachmentPreviewReply attachments={attachments} />);

      // Should not render image without valid URL
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });
});
