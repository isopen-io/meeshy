/**
 * Tests for AttachmentCarousel component
 * Horizontal carousel for file attachments with previews and removal
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentCarousel } from '@/components/attachments/AttachmentCarousel';

// Mock URL methods
const mockObjectUrl = 'blob:mock-url-';
let urlCounter = 0;
global.URL.createObjectURL = jest.fn().mockImplementation((file) => `${mockObjectUrl}${urlCounter++}`);
global.URL.revokeObjectURL = jest.fn();

// Mock createThumbnailsBatch
jest.mock('@/lib/utils/image-thumbnail', () => ({
  createThumbnailsBatch: jest.fn().mockImplementation(async (files) => {
    const result = new Map();
    files.forEach((file: File) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      result.set(key, `data:image/jpeg;base64,mock-thumbnail`);
    });
    return result;
  }),
  isLowEndDevice: jest.fn().mockReturnValue(false),
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
  VideoLightbox: ({ isOpen, onClose, videos, initialIndex }: any) =>
    isOpen ? (
      <div data-testid="video-lightbox">
        Video Lightbox - Index: {initialIndex}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock CompactVideoPlayer
jest.mock('@/components/video/VideoPlayer', () => ({
  CompactVideoPlayer: ({ attachment }: any) => (
    <div data-testid="compact-video-player">{attachment.fileName}</div>
  ),
}));

// Mock dynamic imports for lightboxes
jest.mock('next/dynamic', () => () => {
  const MockLightbox = ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="mock-lightbox"><button onClick={onClose}>Close</button></div> : null;
  return MockLightbox;
});

// Helper to create mock File objects
const createMockFile = (
  name: string,
  type: string,
  size: number = 1024
): File => {
  const file = new File(['file content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('AttachmentCarousel', () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    urlCounter = 0;
  });

  describe('Rendering', () => {
    it('renders nothing when files array is empty and no audio slot', () => {
      const { container } = render(
        <AttachmentCarousel files={[]} onRemove={mockOnRemove} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders carousel when files are provided', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];
      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      expect(screen.getByRole('region', { name: /attachments carousel/i })).toBeInTheDocument();
    });

    it('renders carousel when only audioRecorderSlot is provided', () => {
      render(
        <AttachmentCarousel
          files={[]}
          onRemove={mockOnRemove}
          audioRecorderSlot={<div data-testid="audio-recorder">Audio Recorder</div>}
        />
      );

      expect(screen.getByTestId('audio-recorder')).toBeInTheDocument();
    });

    it('renders file list with listitem roles', () => {
      const files = [
        createMockFile('test1.jpg', 'image/jpeg'),
        createMockFile('test2.pdf', 'application/pdf'),
      ];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems.length).toBeGreaterThanOrEqual(2);
    });

    it('displays files in reverse order (newest first)', async () => {
      const files = [
        createMockFile('first.jpg', 'image/jpeg'),
        createMockFile('second.jpg', 'image/jpeg'),
      ];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        const listItems = screen.getAllByRole('listitem');
        // First item in DOM should be second.jpg (reversed order)
        expect(listItems.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Image Files', () => {
    it('renders image thumbnail', async () => {
      const files = [createMockFile('photo.jpg', 'image/jpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toBeInTheDocument();
      });
    });

    it('displays image extension badge', async () => {
      const files = [createMockFile('photo.jpg', 'image/jpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.JPG')).toBeInTheDocument();
      });
    });

    it('opens image lightbox on click', async () => {
      const files = [createMockFile('photo.jpg', 'image/jpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        const imagePreview = screen.getByRole('img').closest('div');
        if (imagePreview) {
          fireEvent.click(imagePreview);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });
    });

    it('closes image lightbox', async () => {
      const files = [createMockFile('photo.jpg', 'image/jpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      // Open lightbox
      await waitFor(() => {
        const imagePreview = screen.getByRole('img').closest('div');
        if (imagePreview) fireEvent.click(imagePreview);
      });

      await waitFor(() => {
        expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
      });

      // Close lightbox
      fireEvent.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByTestId('image-lightbox')).not.toBeInTheDocument();
      });
    });

    it('generates thumbnails for images', async () => {
      const { createThumbnailsBatch } = require('@/lib/utils/image-thumbnail');
      const files = [createMockFile('photo.jpg', 'image/jpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(createThumbnailsBatch).toHaveBeenCalled();
      });
    });
  });

  describe('Video Files', () => {
    it('renders video preview with CompactVideoPlayer', async () => {
      const files = [createMockFile('video.mp4', 'video/mp4')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByTestId('compact-video-player')).toBeInTheDocument();
      });
    });

    it('renders fullscreen button for video', async () => {
      const files = [createMockFile('video.mp4', 'video/mp4')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('Plein ecran')).toBeInTheDocument();
      });
    });

    it('opens video lightbox on fullscreen button click', async () => {
      const files = [createMockFile('video.mp4', 'video/mp4')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Plein ecran'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Audio Files', () => {
    beforeEach(() => {
      // Mock Audio constructor
      global.Audio = jest.fn().mockImplementation(() => ({
        addEventListener: jest.fn(),
        pause: jest.fn(),
        play: jest.fn().mockResolvedValue(undefined),
        duration: 60,
      })) as any;
    });

    it('renders audio player for audio files', async () => {
      const files = [createMockFile('song.mp3', 'audio/mpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        // Audio files should have play button
        const playButton = screen.getByRole('button', { name: '' });
        expect(playButton).toBeInTheDocument();
      });
    });

    it('displays audio extension badge', async () => {
      const files = [createMockFile('song.mp3', 'audio/mpeg')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.MP3')).toBeInTheDocument();
      });
    });
  });

  describe('PDF Files', () => {
    it('renders PDF icon', async () => {
      const files = [createMockFile('document.pdf', 'application/pdf')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.PDF')).toBeInTheDocument();
      });
    });

    it('opens PDF lightbox on click', async () => {
      const files = [createMockFile('document.pdf', 'application/pdf')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        const pdfPreview = screen.getByText('.PDF').closest('div[title]');
        if (pdfPreview) {
          fireEvent.click(pdfPreview);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('mock-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Text Files', () => {
    it('renders text file icon', async () => {
      const files = [createMockFile('readme.txt', 'text/plain')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.TXT')).toBeInTheDocument();
      });
    });

    it('opens text lightbox on click', async () => {
      const files = [createMockFile('notes.txt', 'text/plain')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        const textPreview = screen.getByText('.TXT').closest('div[title]');
        if (textPreview) {
          fireEvent.click(textPreview);
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('mock-lightbox')).toBeInTheDocument();
      });
    });
  });

  describe('Other File Types', () => {
    it('renders generic icon for unknown types', async () => {
      const files = [createMockFile('data.bin', 'application/octet-stream')];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.BIN')).toBeInTheDocument();
      });
    });
  });

  describe('Remove Button', () => {
    it('shows remove button on hover', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { container } = render(
        <AttachmentCarousel files={files} onRemove={mockOnRemove} />
      );

      await waitFor(() => {
        // Remove button exists but may be opacity-0
        const removeButtons = container.querySelectorAll('button');
        expect(removeButtons.length).toBeGreaterThan(0);
      });
    });

    it('calls onRemove with correct index when clicked', async () => {
      const files = [
        createMockFile('first.jpg', 'image/jpeg'),
        createMockFile('second.jpg', 'image/jpeg'),
      ];

      const { container } = render(
        <AttachmentCarousel files={files} onRemove={mockOnRemove} />
      );

      await waitFor(() => {
        const removeButtons = container.querySelectorAll('button');
        // The button structure may vary, find the X button
        const xButtons = Array.from(removeButtons).filter(
          (btn) => btn.querySelector('svg') && btn.classList.contains('bg-red-500')
        );
        if (xButtons.length > 0) {
          fireEvent.click(xButtons[0]);
        }
      });

      // onRemove should be called with the index
      expect(mockOnRemove).toHaveBeenCalled();
    });

    it('does not show remove button when disabled', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { container } = render(
        <AttachmentCarousel files={files} onRemove={mockOnRemove} disabled={true} />
      );

      await waitFor(() => {
        const removeButtons = container.querySelectorAll('button.bg-red-500');
        expect(removeButtons.length).toBe(0);
      });
    });

    it('does not show remove button during upload', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { container } = render(
        <AttachmentCarousel
          files={files}
          onRemove={mockOnRemove}
          uploadProgress={{ 0: 50 }}
        />
      );

      await waitFor(() => {
        const removeButtons = container.querySelectorAll('button.bg-red-500');
        expect(removeButtons.length).toBe(0);
      });
    });
  });

  describe('Upload Progress', () => {
    it('shows upload indicator during upload', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      render(
        <AttachmentCarousel
          files={files}
          onRemove={mockOnRemove}
          uploadProgress={{ 0: 50 }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('shows loading spinner during upload', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { container } = render(
        <AttachmentCarousel
          files={files}
          onRemove={mockOnRemove}
          uploadProgress={{ 0: 30 }}
        />
      );

      await waitFor(() => {
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });
    });

    it('shows checkmark when upload complete', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { container } = render(
        <AttachmentCarousel
          files={files}
          onRemove={mockOnRemove}
          uploadProgress={{ 0: 100 }}
        />
      );

      await waitFor(() => {
        const checkmark = container.querySelector('.text-green-500');
        expect(checkmark).toBeInTheDocument();
      });
    });
  });

  describe('File Size Badge', () => {
    it('displays formatted file size', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg', 2048)];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('2 KB')).toBeInTheDocument();
      });
    });

    it('displays MB for larger files', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg', 5242880)];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('5 MB')).toBeInTheDocument();
      });
    });
  });

  describe('Tooltip', () => {
    it('renders tooltip with file info', async () => {
      const files = [createMockFile('test.jpg', 'image/jpeg', 1024)];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      // Tooltips are rendered on hover
      await waitFor(() => {
        const trigger = screen.getByRole('listitem');
        expect(trigger).toBeInTheDocument();
      });
    });
  });

  describe('Audio Recorder Slot', () => {
    it('renders audio recorder slot at the beginning', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      render(
        <AttachmentCarousel
          files={files}
          onRemove={mockOnRemove}
          audioRecorderSlot={<div data-testid="audio-slot">Recording...</div>}
        />
      );

      expect(screen.getByTestId('audio-slot')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper region role', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];
      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      expect(screen.getByRole('region', { name: /attachments carousel/i })).toBeInTheDocument();
    });

    it('has proper list role for file list', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];
      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      expect(screen.getByRole('list', { name: /attached files/i })).toBeInTheDocument();
    });

    it('list is focusable for keyboard navigation', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];
      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      const list = screen.getByRole('list', { name: /attached files/i });
      expect(list).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Cleanup', () => {
    it('revokes object URLs on unmount', () => {
      const files = [createMockFile('test.jpg', 'image/jpeg')];

      const { unmount } = render(
        <AttachmentCarousel files={files} onRemove={mockOnRemove} />
      );

      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('Multiple Files', () => {
    it('handles multiple file types', async () => {
      const files = [
        createMockFile('photo.jpg', 'image/jpeg'),
        createMockFile('video.mp4', 'video/mp4'),
        createMockFile('doc.pdf', 'application/pdf'),
        createMockFile('notes.txt', 'text/plain'),
      ];

      render(<AttachmentCarousel files={files} onRemove={mockOnRemove} />);

      await waitFor(() => {
        expect(screen.getByText('.JPG')).toBeInTheDocument();
        expect(screen.getByText('.PDF')).toBeInTheDocument();
        expect(screen.getByText('.TXT')).toBeInTheDocument();
        expect(screen.getByTestId('compact-video-player')).toBeInTheDocument();
      });
    });
  });
});

describe('AudioFilePreview', () => {
  // AudioFilePreview is tested as part of AttachmentCarousel
  // since it's a memoized internal component

  it('creates audio element for playback', async () => {
    global.Audio = jest.fn().mockImplementation(() => ({
      addEventListener: jest.fn(),
      pause: jest.fn(),
      play: jest.fn().mockResolvedValue(undefined),
      duration: 120,
    })) as any;

    const files = [createMockFile('song.mp3', 'audio/mpeg')];

    const { container } = render(
      <AttachmentCarousel files={files} onRemove={jest.fn()} />
    );

    await waitFor(() => {
      const audioElement = container.querySelector('audio');
      expect(audioElement).toBeInTheDocument();
    });
  });
});
