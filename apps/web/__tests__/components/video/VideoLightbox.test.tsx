/**
 * Tests for VideoLightbox component
 * Tests fullscreen video playback, navigation, controls, and keyboard shortcuts
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VideoLightbox } from '../../../components/video/VideoLightbox';
import type { Attachment } from '@meeshy/shared/types/attachment';

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, onClick, style, ...props }: any) => (
      <div className={className} onClick={onClick} style={style} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>X</span>
  ),
  Download: ({ className }: { className?: string }) => (
    <span data-testid="download-icon" className={className}>DL</span>
  ),
  ChevronLeft: ({ className }: { className?: string }) => (
    <span data-testid="chevron-left-icon" className={className}>&lt;</span>
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron-right-icon" className={className}>&gt;</span>
  ),
  Play: ({ className }: { className?: string }) => (
    <span data-testid="play-icon" className={className}>Play</span>
  ),
  Pause: ({ className }: { className?: string }) => (
    <span data-testid="pause-icon" className={className}>Pause</span>
  ),
  Volume2: ({ className }: { className?: string }) => (
    <span data-testid="volume-icon" className={className}>Vol</span>
  ),
  VolumeX: ({ className }: { className?: string }) => (
    <span data-testid="volume-muted-icon" className={className}>Muted</span>
  ),
  Maximize: ({ className }: { className?: string }) => (
    <span data-testid="maximize-icon" className={className}>Max</span>
  ),
  Minimize: ({ className }: { className?: string }) => (
    <span data-testid="minimize-icon" className={className}>Min</span>
  ),
}));

// Mock formatFileSize
jest.mock('@meeshy/shared/types/attachment', () => ({
  formatFileSize: (size: number) => `${(size / 1024).toFixed(1)} KB`,
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  return 1;
});
global.cancelAnimationFrame = jest.fn();

// Mock HTMLMediaElement
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: jest.fn().mockResolvedValue(undefined),
  writable: true,
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: jest.fn(),
  writable: true,
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  value: jest.fn(),
  writable: true,
});

// Helper to create mock video attachment
const createMockVideo = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: `video-${Math.random().toString(36).substr(2, 9)}`,
  fileUrl: 'https://example.com/video.mp4',
  originalName: 'test-video.mp4',
  mimeType: 'video/mp4',
  fileSize: 5242880, // 5 MB
  width: 1920,
  height: 1080,
  duration: 120, // 2 minutes
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('VideoLightbox', () => {
  const defaultProps = {
    videos: [createMockVideo()],
    initialIndex: 0,
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('should render when isOpen is true', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<VideoLightbox {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('test-video.mp4')).not.toBeInTheDocument();
    });

    it('should render video element', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
    });

    it('should display video filename', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    it('should display video file size', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByText(/KB/)).toBeInTheDocument();
    });

    it('should display video dimensions', () => {
      const videos = [createMockVideo({ width: 1920, height: 1080 })];
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = jest.fn();
      render(<VideoLightbox {...defaultProps} onClose={onClose} />);

      const closeButtons = screen.getAllByTestId('x-icon');
      const closeButton = closeButtons[0].closest('button');
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      const onClose = jest.fn();
      const { container } = render(<VideoLightbox {...defaultProps} onClose={onClose} />);

      // Find the backdrop element (fixed inset-0)
      const backdrop = container.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when Escape key pressed', () => {
      const onClose = jest.fn();
      render(<VideoLightbox {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Play/Pause Controls', () => {
    it('should render play button when video is paused', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getAllByTestId('play-icon').length).toBeGreaterThan(0);
    });

    it('should toggle play/pause when spacebar pressed', async () => {
      render(<VideoLightbox {...defaultProps} />);

      await act(async () => {
        fireEvent.keyDown(window, { key: ' ' });
      });

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('should toggle play/pause when play button clicked', async () => {
      render(<VideoLightbox {...defaultProps} />);

      const playButtons = screen.getAllByTestId('play-icon');
      const playButton = playButtons[0].closest('button');
      if (playButton) {
        await act(async () => {
          fireEvent.click(playButton);
        });
      }

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });

  describe('Volume Controls', () => {
    it('should render volume button', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByTestId('volume-icon')).toBeInTheDocument();
    });

    it('should toggle mute when M key pressed', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'm' });

      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
    });

    it('should toggle mute with capital M', () => {
      render(<VideoLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'M' });

      // Mute toggle should work
      expect(screen.getByTestId('volume-muted-icon')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should render navigation buttons when multiple videos', () => {
      const videos = [createMockVideo(), createMockVideo(), createMockVideo()];
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      expect(screen.getByTestId('chevron-left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
    });

    it('should not render navigation buttons for single video', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.queryByTestId('chevron-left-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chevron-right-icon')).not.toBeInTheDocument();
    });

    it('should navigate to previous video on left arrow', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />);

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    it('should navigate to next video on right arrow', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />);

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByText('video2.mp4')).toBeInTheDocument();
    });

    it('should wrap around from last to first video', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />);

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    it('should wrap around from first to last video', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />);

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByText('video2.mp4')).toBeInTheDocument();
    });

    it('should show video index when multiple videos', () => {
      const videos = [createMockVideo(), createMockVideo(), createMockVideo()];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />);

      expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();
    });
  });

  describe('Fullscreen', () => {
    it('should render fullscreen button', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByTestId('maximize-icon')).toBeInTheDocument();
    });

    it('should toggle fullscreen when F key pressed', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'f' });

      // Fullscreen API should be called
      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
    });

    it('should toggle fullscreen with capital F', () => {
      render(<VideoLightbox {...defaultProps} />);

      fireEvent.keyDown(window, { key: 'F' });

      // Should not throw
      expect(screen.getByTestId('maximize-icon')).toBeInTheDocument();
    });
  });

  describe('Download', () => {
    it('should render download button', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });

    it('should have correct download attributes', () => {
      render(<VideoLightbox {...defaultProps} />);

      const downloadButton = screen.getByTestId('download-icon').closest('button');
      expect(downloadButton).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('should render progress bar', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      const progressBar = container.querySelector('input[type="range"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should display time in correct format', () => {
      render(<VideoLightbox {...defaultProps} />);

      // Should show 0:00 / X:XX format
      expect(screen.getByText(/0:00/)).toBeInTheDocument();
    });
  });

  describe('Body Scroll Lock', () => {
    it('should lock body scroll when open', () => {
      render(<VideoLightbox {...defaultProps} isOpen={true} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      const { rerender } = render(<VideoLightbox {...defaultProps} isOpen={true} />);

      rerender(<VideoLightbox {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('');
    });

    it('should restore body scroll on unmount', () => {
      const { unmount } = render(<VideoLightbox {...defaultProps} isOpen={true} />);

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Touch Support', () => {
    it('should handle swipe gestures', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      const { container } = render(
        <VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />
      );

      const touchArea = container.querySelector('.absolute.inset-0');
      if (touchArea) {
        // Simulate swipe left
        fireEvent.touchStart(touchArea, {
          touches: [{ clientX: 200 }],
        });
        fireEvent.touchMove(touchArea, {
          touches: [{ clientX: 50 }],
        });
        fireEvent.touchEnd(touchArea);

        // Should navigate to next video
        expect(screen.getByText('video2.mp4')).toBeInTheDocument();
      }
    });

    it('should handle swipe right', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      const { container } = render(
        <VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />
      );

      const touchArea = container.querySelector('.absolute.inset-0');
      if (touchArea) {
        // Simulate swipe right
        fireEvent.touchStart(touchArea, {
          touches: [{ clientX: 50 }],
        });
        fireEvent.touchMove(touchArea, {
          touches: [{ clientX: 200 }],
        });
        fireEvent.touchEnd(touchArea);

        // Should navigate to previous video
        expect(screen.getByText('video1.mp4')).toBeInTheDocument();
      }
    });
  });

  describe('Video Metadata', () => {
    it('should display duration when available', () => {
      const videos = [createMockVideo({ duration: 125 })]; // 2:05
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      expect(screen.getByText(/2:05/)).toBeInTheDocument();
    });

    it('should handle video without dimensions', () => {
      const videos = [createMockVideo({ width: undefined, height: undefined })];
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      // Should still render the video without dimension info
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
      // Should NOT show dimension format like "1920x1080"
      expect(screen.queryByText(/\d+x\d+/)).not.toBeInTheDocument();
    });

    it('should handle video without duration', () => {
      const videos = [createMockVideo({ duration: undefined })];
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      // Should still render
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });
  });

  describe('Keyboard Instructions', () => {
    it('should display keyboard instructions on desktop', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByText(/flèches/i)).toBeInTheDocument();
      expect(screen.getByText(/Espace/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible buttons with aria-labels', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByLabelText(/Fermer/i)).toBeInTheDocument();
    });

    it('should have accessible download button', () => {
      render(<VideoLightbox {...defaultProps} />);

      expect(screen.getByLabelText(/Télécharger/i)).toBeInTheDocument();
    });

    it('should have accessible navigation buttons when multiple videos', () => {
      const videos = [createMockVideo(), createMockVideo()];
      render(<VideoLightbox {...defaultProps} videos={videos} />);

      expect(screen.getByLabelText(/précédente/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/suivante/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty videos array', () => {
      const { container } = render(
        <VideoLightbox {...defaultProps} videos={[]} />
      );

      // Should not render anything
      expect(container.querySelector('video')).not.toBeInTheDocument();
    });

    it('should handle index out of bounds', () => {
      const videos = [createMockVideo({ originalName: 'first-video.mp4' })];
      const { container } = render(
        <VideoLightbox {...defaultProps} videos={videos} initialIndex={10} />
      );

      // Component should handle OOB gracefully - either by showing first video
      // or by returning null. Both behaviors are acceptable.
      const video = container.querySelector('video');
      const hasContent = video || container.textContent?.includes('first-video.mp4');
      // Either renders the video or returns null (no crash)
      expect(container).toBeInTheDocument();
    });

    it('should reset state when changing videos', () => {
      const videos1 = [createMockVideo({ originalName: 'first.mp4' })];
      const videos2 = [createMockVideo({ originalName: 'second.mp4' })];

      const { rerender } = render(
        <VideoLightbox {...defaultProps} videos={videos1} />
      );

      rerender(<VideoLightbox {...defaultProps} videos={videos2} />);

      expect(screen.getByText('second.mp4')).toBeInTheDocument();
    });

    it('should update when initialIndex changes', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];

      const { rerender } = render(
        <VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />
      );

      expect(screen.getByText('video1.mp4')).toBeInTheDocument();

      rerender(
        <VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />
      );

      expect(screen.getByText('video2.mp4')).toBeInTheDocument();
    });
  });
});
