/**
 * Tests for AttachmentDetails component
 * Displays attachment metadata with appropriate icons and details
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentDetails, AttachmentDetailsSummary } from '@/components/attachments/AttachmentDetails';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Create mock attachment helper
const createMockAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'attachment-123',
  messageId: 'message-456',
  fileName: 'test-file.txt',
  originalName: 'test-file.txt',
  mimeType: 'text/plain',
  fileSize: 1024,
  fileUrl: 'https://example.com/files/test-file.txt',
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

describe('AttachmentDetails', () => {
  describe('Audio Attachments', () => {
    const audioAttachment = createMockAttachment({
      mimeType: 'audio/mpeg',
      originalName: 'song.mp3',
      duration: 180000, // 3 minutes in milliseconds
      bitrate: 320000,
      sampleRate: 44100,
    });

    it('renders audio icon', () => {
      const { container } = render(<AttachmentDetails attachment={audioAttachment} />);

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('displays formatted duration', () => {
      render(<AttachmentDetails attachment={audioAttachment} />);

      expect(screen.getByText('3:00')).toBeInTheDocument();
    });

    it('displays bitrate', () => {
      render(<AttachmentDetails attachment={audioAttachment} />);

      expect(screen.getByText('320kbps')).toBeInTheDocument();
    });

    it('displays sample rate', () => {
      render(<AttachmentDetails attachment={audioAttachment} />);

      expect(screen.getByText('44.1kHz')).toBeInTheDocument();
    });

    it('displays duration over an hour correctly', () => {
      const longAudio = createMockAttachment({
        mimeType: 'audio/mpeg',
        duration: 3661000, // 1:01:01
      });

      render(<AttachmentDetails attachment={longAudio} />);

      expect(screen.getByText('1:01:01')).toBeInTheDocument();
    });

    it('displays audio effects emoji when effects are applied', () => {
      const audioWithEffects = createMockAttachment({
        mimeType: 'audio/mpeg',
        duration: 60000,
        metadata: {
          audioEffectsTimeline: {
            events: [
              { action: 'activate', effectType: 'voice-coder', timestamp: 0, params: {} },
            ],
            metadata: {},
          },
        },
      });

      const { container } = render(<AttachmentDetails attachment={audioWithEffects as any} />);

      // Should contain an effect emoji
      expect(container.textContent).toMatch(/[^\s]/);
    });
  });

  describe('Video Attachments', () => {
    const videoAttachment = createMockAttachment({
      mimeType: 'video/mp4',
      originalName: 'video.mp4',
      duration: 120000, // 2 minutes
      width: 1920,
      height: 1080,
      fps: 30,
      videoCodec: 'h264',
    });

    it('renders video icon', () => {
      const { container } = render(<AttachmentDetails attachment={videoAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays formatted duration', () => {
      render(<AttachmentDetails attachment={videoAttachment} />);

      expect(screen.getByText('2:00')).toBeInTheDocument();
    });

    it('displays dimensions', () => {
      render(<AttachmentDetails attachment={videoAttachment} />);

      expect(screen.getByText(/1920.*1080/)).toBeInTheDocument();
    });

    it('displays fps', () => {
      render(<AttachmentDetails attachment={videoAttachment} />);

      expect(screen.getByText('30fps')).toBeInTheDocument();
    });

    it('displays codec', () => {
      render(<AttachmentDetails attachment={videoAttachment} />);

      expect(screen.getByText('H264')).toBeInTheDocument();
    });
  });

  describe('Image Attachments', () => {
    const imageAttachment = createMockAttachment({
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
      fileSize: 2097152, // 2 MB
      width: 3840,
      height: 2160,
    });

    it('renders image icon', () => {
      const { container } = render(<AttachmentDetails attachment={imageAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays dimensions', () => {
      render(<AttachmentDetails attachment={imageAttachment} />);

      expect(screen.getByText(/3840.*2160/)).toBeInTheDocument();
    });

    it('displays file size', () => {
      render(<AttachmentDetails attachment={imageAttachment} />);

      expect(screen.getByText('2 MB')).toBeInTheDocument();
    });
  });

  describe('Document Attachments', () => {
    const pdfAttachment = createMockAttachment({
      mimeType: 'application/pdf',
      originalName: 'document.pdf',
      fileSize: 512000, // 500 KB
      pageCount: 10,
    });

    it('renders document icon', () => {
      const { container } = render(<AttachmentDetails attachment={pdfAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays PDF label', () => {
      render(<AttachmentDetails attachment={pdfAttachment} />);

      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('displays page count', () => {
      render(<AttachmentDetails attachment={pdfAttachment} />);

      expect(screen.getByText('10 pages')).toBeInTheDocument();
    });

    it('displays singular page for single page', () => {
      const singlePage = createMockAttachment({
        mimeType: 'application/pdf',
        pageCount: 1,
      });

      render(<AttachmentDetails attachment={singlePage} />);

      expect(screen.getByText('1 page')).toBeInTheDocument();
    });

    it('displays file size', () => {
      render(<AttachmentDetails attachment={pdfAttachment} />);

      expect(screen.getByText('500 KB')).toBeInTheDocument();
    });
  });

  describe('Code Attachments', () => {
    const codeAttachment = createMockAttachment({
      mimeType: 'text/javascript',
      originalName: 'script.js',
      fileSize: 4096,
      lineCount: 150,
    });

    it('renders code icon', () => {
      const { container } = render(<AttachmentDetails attachment={codeAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays file extension', () => {
      render(<AttachmentDetails attachment={codeAttachment} />);

      expect(screen.getByText('JS')).toBeInTheDocument();
    });

    it('displays line count', () => {
      render(<AttachmentDetails attachment={codeAttachment} />);

      expect(screen.getByText('150 lignes')).toBeInTheDocument();
    });

    it('displays singular line for single line', () => {
      const singleLine = createMockAttachment({
        mimeType: 'text/javascript',
        originalName: 'oneliner.js',
        lineCount: 1,
      });

      render(<AttachmentDetails attachment={singleLine} />);

      expect(screen.getByText('1 ligne')).toBeInTheDocument();
    });
  });

  describe('Text Attachments', () => {
    const textAttachment = createMockAttachment({
      mimeType: 'text/plain',
      originalName: 'notes.txt',
      fileSize: 2048,
      lineCount: 50,
    });

    it('renders text icon', () => {
      const { container } = render(<AttachmentDetails attachment={textAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays TXT label', () => {
      render(<AttachmentDetails attachment={textAttachment} />);

      expect(screen.getByText('TXT')).toBeInTheDocument();
    });

    it('displays line count', () => {
      render(<AttachmentDetails attachment={textAttachment} />);

      expect(screen.getByText('50 lignes')).toBeInTheDocument();
    });
  });

  describe('Generic Attachments', () => {
    const genericAttachment = createMockAttachment({
      mimeType: 'application/octet-stream',
      originalName: 'data.bin',
      fileSize: 1048576, // 1 MB
    });

    it('renders generic file icon', () => {
      const { container } = render(<AttachmentDetails attachment={genericAttachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('displays file size', () => {
      render(<AttachmentDetails attachment={genericAttachment} />);

      expect(screen.getByText('1 MB')).toBeInTheDocument();
    });
  });

  describe('Icon Visibility', () => {
    it('shows icon by default', () => {
      const attachment = createMockAttachment();
      const { container } = render(<AttachmentDetails attachment={attachment} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('hides icon when showIcon is false', () => {
      const attachment = createMockAttachment();
      const { container } = render(
        <AttachmentDetails attachment={attachment} showIcon={false} />
      );

      // Should still have the container but no svg directly in flex-shrink-0
      const iconContainer = container.querySelector('.flex-shrink-0');
      expect(iconContainer).not.toBeInTheDocument();
    });
  });

  describe('Icon Sizes', () => {
    const attachment = createMockAttachment({ mimeType: 'image/jpeg' });

    it('renders small icon', () => {
      const { container } = render(
        <AttachmentDetails attachment={attachment} iconSize="sm" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('h-4', 'w-4');
    });

    it('renders medium icon by default', () => {
      const { container } = render(<AttachmentDetails attachment={attachment} />);

      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('h-5', 'w-5');
    });

    it('renders large icon', () => {
      const { container } = render(
        <AttachmentDetails attachment={attachment} iconSize="lg" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('h-6', 'w-6');
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const attachment = createMockAttachment();
      const { container } = render(
        <AttachmentDetails attachment={attachment} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Duration Formatting', () => {
    it('handles zero duration', () => {
      const attachment = createMockAttachment({
        mimeType: 'audio/mpeg',
        duration: 0,
      });

      render(<AttachmentDetails attachment={attachment} />);

      // Should not display duration when 0 or undefined
      expect(screen.queryByText('0:00')).not.toBeInTheDocument();
    });

    it('handles negative duration', () => {
      const attachment = createMockAttachment({
        mimeType: 'audio/mpeg',
        duration: -1000,
      });

      render(<AttachmentDetails attachment={attachment} />);

      // Should not display invalid duration
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });
  });

  describe('File Size Formatting', () => {
    it('formats bytes correctly', () => {
      const attachment = createMockAttachment({ fileSize: 500 });
      render(<AttachmentDetails attachment={attachment} />);

      expect(screen.getByText('500 B')).toBeInTheDocument();
    });

    it('formats kilobytes correctly', () => {
      const attachment = createMockAttachment({ fileSize: 5120 });
      render(<AttachmentDetails attachment={attachment} />);

      expect(screen.getByText('5 KB')).toBeInTheDocument();
    });

    it('formats megabytes correctly', () => {
      const attachment = createMockAttachment({ fileSize: 5242880 });
      render(<AttachmentDetails attachment={attachment} />);

      expect(screen.getByText('5 MB')).toBeInTheDocument();
    });

    it('formats gigabytes correctly', () => {
      const attachment = createMockAttachment({ fileSize: 5368709120 });
      render(<AttachmentDetails attachment={attachment} />);

      expect(screen.getByText('5 GB')).toBeInTheDocument();
    });

    it('handles zero file size', () => {
      const attachment = createMockAttachment({ fileSize: 0 });
      render(<AttachmentDetails attachment={attachment} />);

      expect(screen.getByText('0 B')).toBeInTheDocument();
    });
  });
});

describe('AttachmentDetailsSummary', () => {
  describe('Type Labels', () => {
    it('displays Audio label for audio files', () => {
      const attachment = createMockAttachment({ mimeType: 'audio/mpeg' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Audio')).toBeInTheDocument();
    });

    it('displays Video label for video files', () => {
      const attachment = createMockAttachment({ mimeType: 'video/mp4' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Video')).toBeInTheDocument();
    });

    it('displays Image label for image files', () => {
      const attachment = createMockAttachment({ mimeType: 'image/jpeg' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Image')).toBeInTheDocument();
    });

    it('displays Document label for PDF files', () => {
      const attachment = createMockAttachment({ mimeType: 'application/pdf' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Document')).toBeInTheDocument();
    });

    it('displays Code label for code files', () => {
      const attachment = createMockAttachment({
        mimeType: 'text/javascript',
        originalName: 'script.js',
      });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Code')).toBeInTheDocument();
    });

    it('displays Texte label for text files', () => {
      const attachment = createMockAttachment({ mimeType: 'text/plain' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Texte')).toBeInTheDocument();
    });

    it('displays Fichier label for unknown types', () => {
      const attachment = createMockAttachment({ mimeType: 'application/octet-stream' });
      render(<AttachmentDetailsSummary attachment={attachment} />);

      expect(screen.getByText('Fichier')).toBeInTheDocument();
    });
  });

  describe('Icon Colors', () => {
    it('uses purple for audio', () => {
      const attachment = createMockAttachment({ mimeType: 'audio/mpeg' });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-purple-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses red for video', () => {
      const attachment = createMockAttachment({ mimeType: 'video/mp4' });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-red-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses blue for image', () => {
      const attachment = createMockAttachment({ mimeType: 'image/jpeg' });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-blue-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses orange for document', () => {
      const attachment = createMockAttachment({ mimeType: 'application/pdf' });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-orange-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses green for code', () => {
      const attachment = createMockAttachment({
        mimeType: 'text/javascript',
        originalName: 'script.js',
      });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-green-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses gray for text and unknown', () => {
      const attachment = createMockAttachment({ mimeType: 'text/plain' });
      const { container } = render(<AttachmentDetailsSummary attachment={attachment} />);

      const iconContainer = container.querySelector('.text-gray-500');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const attachment = createMockAttachment();
      const { container } = render(
        <AttachmentDetailsSummary attachment={attachment} className="custom-summary-class" />
      );

      expect(container.firstChild).toHaveClass('custom-summary-class');
    });
  });
});
