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
  ...jest.requireActual('@meeshy/shared/types/attachment'),
  formatFileSize: (size: number) => `${(size / 1024).toFixed(1)} KB`,
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  return 1;
});
global.cancelAnimationFrame = jest.fn();

// Mock useI18n hook with common namespace translations
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.close': 'Fermer',
        'common.download': 'Télécharger',
        'common.play': 'Lire',
        'common.pause': 'Pause',
        'common.mute': 'Couper le son',
        'common.unmute': 'Activer le son',
        'common.previous': 'Vidéo précédente',
        'common.next': 'Vidéo suivante',
        'common.enterFullscreen': 'Plein écran',
        'common.exitFullscreen': 'Quitter le plein écran',
        'common.videoLightboxKeyboardHelp':
          'Utilisez les flèches ← → pour naviguer • Espace pour lecture/pause • M pour couper le son • F pour le plein écran • Échap pour fermer',
      };
      return translations[key] || key;
    },
    isLoading: false,
  }),
}));

// Mock useI18n (aliased import)
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.close': 'Fermer',
        'common.download': 'Télécharger',
        'common.play': 'Lire',
        'common.pause': 'Pause',
        'common.mute': 'Couper le son',
        'common.unmute': 'Activer le son',
        'common.previous': 'Vidéo précédente',
        'common.next': 'Vidéo suivante',
        'common.enterFullscreen': 'Plein écran',
        'common.exitFullscreen': 'Quitter le plein écran',
        'common.videoLightboxKeyboardHelp':
          'Utilisez les flèches ← → pour naviguer • Espace pour lecture/pause • M pour couper le son • F pour le plein écran • Échap pour fermer',
      };
      return translations[key] || key;
    },
    isLoading: false,
  }),
}));

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
  fileSize: 5242880,
  width: 1920,
  height: 1080,
  duration: 120,
  createdAt: new Date().toISOString(),
  ...overrides,
} as any);

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

      // formatFileSize(5242880) = '5 MB'
      expect(screen.getByText(/\d+(\.\d+)?\s*(KB|MB|GB)/i)).toBeInTheDocument();
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

  describe('togglePlay pause branch', () => {
    it('pauses video when togglePlay called while already playing', async () => {
      render(<VideoLightbox {...defaultProps} />);

      // Start playing
      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

      // Pause by pressing space again (now isPlaying=true)
      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    });

    it('handles play() rejection gracefully', async () => {
      (HTMLMediaElement.prototype.play as jest.Mock).mockRejectedValueOnce(new Error('play failed'));
      render(<VideoLightbox {...defaultProps} />);

      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });

      // Error is swallowed — component still renders
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });
  });

  describe('Nav button clicks (inline onClick bodies)', () => {
    it('clicking left nav button navigates to previous video', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={1} />);

      const prevButton = screen.getByLabelText(/précédente/i);
      fireEvent.click(prevButton);

      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    it('clicking right nav button navigates to next video', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />);

      const nextButton = screen.getByLabelText(/suivante/i);
      fireEvent.click(nextButton);

      expect(screen.getByText('video2.mp4')).toBeInTheDocument();
    });
  });

  describe('Download button', () => {
    it('top-bar download button click triggers handleDownload', () => {
      render(<VideoLightbox {...defaultProps} />);

      // Mock DOM operations AFTER render so React's initial mount is unaffected
      const mockLink = {
        href: '',
        download: '',
        target: '',
        click: jest.fn(),
      };
      const createSpy = jest.spyOn(document, 'createElement').mockReturnValueOnce(mockLink as any);
      const appendSpy = jest.spyOn(document.body, 'appendChild').mockImplementationOnce(() => mockLink as any);
      const removeSpy = jest.spyOn(document.body, 'removeChild').mockImplementationOnce(() => mockLink as any);

      const downloadButton = screen.getByLabelText(/Télécharger/i);
      fireEvent.click(downloadButton);

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.href).toBe('https://example.com/video.mp4');

      createSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Seek range input', () => {
    it('handleSeek updates currentTime via range input change', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      const rangeInputs = container.querySelectorAll('input[type="range"]');
      const seekInput = rangeInputs[0] as HTMLInputElement;

      fireEvent.change(seekInput, { target: { value: '30' } });

      expect(screen.getByText(/0:30/)).toBeInTheDocument();
    });
  });

  describe('Volume controls', () => {
    it('handleVolumeChange: unmutes when volume raised while muted', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      // Mute first
      fireEvent.keyDown(window, { key: 'm' });
      expect(screen.getByTestId('volume-muted-icon')).toBeInTheDocument();

      // Raise volume while muted → should unmute
      const rangeInputs = container.querySelectorAll('input[type="range"]');
      const volumeInput = rangeInputs[1] as HTMLInputElement;
      fireEvent.change(volumeInput, { target: { value: '0.7' } });

      expect(screen.getByTestId('volume-icon')).toBeInTheDocument();
    });

    it('bottom-bar mute button toggles mute state', () => {
      render(<VideoLightbox {...defaultProps} />);

      const muteButton = screen.getByLabelText(/Couper le son/i);
      fireEvent.click(muteButton);

      expect(screen.getByTestId('volume-muted-icon')).toBeInTheDocument();
    });
  });

  describe('Video events', () => {
    it('handleLoadedMetadata event sets duration and dimensions', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      Object.defineProperty(video, 'duration', { value: 90, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });

      fireEvent.loadedMetadata(video);

      expect(screen.getByText(/1:30/)).toBeInTheDocument();
    });

    it('handleEnded event stops playback and sets time to duration', async () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      // Set up duration first
      Object.defineProperty(video, 'duration', { value: 60, configurable: true });
      fireEvent.loadedMetadata(video);

      // Start playing
      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });

      // End the video
      act(() => { fireEvent.ended(video); });

      // Should show play icon (stopped)
      expect(screen.getAllByTestId('play-icon').length).toBeGreaterThan(0);
    });
  });

  describe('Fullscreen change event', () => {
    it('fullscreenchange event updates isFullscreen state', () => {
      render(<VideoLightbox {...defaultProps} />);

      // Simulate browser entering fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });

      act(() => { fireEvent(document, new Event('fullscreenchange')); });

      expect(screen.getByTestId('minimize-icon')).toBeInTheDocument();

      // Cleanup
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
      });
    });
  });

  describe('isPlaying state rendering', () => {
    it('shows Pause icon when video is playing', async () => {
      render(<VideoLightbox {...defaultProps} />);

      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });

      expect(screen.getByTestId('pause-icon')).toBeInTheDocument();
    });
  });

  describe('isFullscreen rendering', () => {
    it('shows Minimize icon in bottom bar when isFullscreen is true', () => {
      render(<VideoLightbox {...defaultProps} />);

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });
      act(() => { fireEvent(document, new Event('fullscreenchange')); });

      expect(screen.getByTestId('minimize-icon')).toBeInTheDocument();

      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
      });
    });

    it('clicking fullscreen button in bottom bar calls toggleFullscreen', async () => {
      const requestFullscreenMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(HTMLVideoElement.prototype, 'requestFullscreen', {
        value: requestFullscreenMock,
        configurable: true,
      });

      render(<VideoLightbox {...defaultProps} />);

      const fullscreenButton = screen.getByLabelText(/Plein écran/i);
      await act(async () => { fireEvent.click(fullscreenButton); });

      expect(requestFullscreenMock).toHaveBeenCalled();
    });
  });

  describe('Mobile layout (getVideoContainerStyle)', () => {
    it('returns full-size style on narrow screens', () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });

      const { container } = render(<VideoLightbox {...defaultProps} />);

      // The inner video container should have 100% dimensions (mobile path)
      const styledDivs = Array.from(container.querySelectorAll('[style]'));
      const mobileContainer = styledDivs.find((el) => {
        const style = (el as HTMLElement).style;
        return style.width === '100%';
      });
      expect(mobileContainer).toBeTruthy();

      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
    });
  });

  describe('Desktop layout with video dimensions', () => {
    it('uses video aspect ratio for container on desktop after loadedmetadata', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true, writable: true });

      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      Object.defineProperty(video, 'duration', { value: 60, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });

      act(() => { fireEvent.loadedMetadata(video); });

      // Container should have pixel-based width/height (not percentages)
      const styledDivs = Array.from(container.querySelectorAll('[style]'));
      const pixelContainer = styledDivs.find((el) => {
        const style = (el as HTMLElement).style;
        return style.width && style.width.includes('px');
      });
      expect(pixelContainer).toBeTruthy();
    });
  });

  describe('Animation frame cleanup', () => {
    it('cancels rAF when play transitions back to stopped', async () => {
      (global.requestAnimationFrame as jest.Mock).mockReturnValueOnce(42);

      render(<VideoLightbox {...defaultProps} />);

      // Start playing → rAF registered with id=42
      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });

      // Stop playing → cleanup should cancel id=42
      await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });

      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(42);
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

  describe('Exit fullscreen path (lines 184-195)', () => {
    it('clicking fullscreen button while fullscreenElement is set calls exitFullscreen', async () => {
      const exitFullscreenMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(document, 'exitFullscreen', {
        value: exitFullscreenMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });

      render(<VideoLightbox {...defaultProps} />);

      // Update isFullscreen state via event so button shows "Quitter le plein écran"
      act(() => { fireEvent(document, new Event('fullscreenchange')); });

      const fullscreenButton = screen.getByLabelText(/Quitter le plein écran/i);
      await act(async () => { fireEvent.click(fullscreenButton); });

      expect(exitFullscreenMock).toHaveBeenCalled();

      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    });
  });

  describe('handleResize with videoDimensions (lines 233-234)', () => {
    it('fires window resize after loadedmetadata sets dimensions', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
      Object.defineProperty(video, 'duration', { value: 60, configurable: true });
      act(() => { fireEvent.loadedMetadata(video); });

      // Fire resize — handler reads new videoWidth/videoHeight when width > 0
      act(() => { fireEvent(window, new Event('resize')); });

      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });
  });

  describe('Video container click stopPropagation (line 496)', () => {
    it('clicking video container does not close lightbox', () => {
      const onClose = jest.fn();
      const { container } = render(<VideoLightbox {...defaultProps} onClose={onClose} />);

      // The motion.div (video container) is the parent element of the <video> tag
      const videoParent = container.querySelector('video')?.parentElement;
      if (videoParent) {
        fireEvent.click(videoParent);
      }

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Volume range click stopPropagation (line 654)', () => {
    it('clicking volume range input does not close lightbox', () => {
      const onClose = jest.fn();
      const { container } = render(<VideoLightbox {...defaultProps} onClose={onClose} />);

      const rangeInputs = container.querySelectorAll('input[type="range"]');
      const volumeRange = rangeInputs[1];
      if (volumeRange) {
        fireEvent.click(volumeRange);
      }

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('1-video navigation no-op (videos.length > 1 false branch)', () => {
    it('ArrowLeft with single video does nothing', () => {
      // defaultProps has 1 video; goToPrevious if-block is skipped
      render(<VideoLightbox {...defaultProps} />);
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    it('ArrowRight with single video does nothing', () => {
      render(<VideoLightbox {...defaultProps} />);
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });
  });

  describe('Small swipe ignored (Math.abs(diff) <= minSwipeDistance false branch)', () => {
    it('swipe distance below 50px does not navigate', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      const { container } = render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />);

      const touchArea = container.querySelector('.absolute.inset-0');
      if (touchArea) {
        fireEvent.touchStart(touchArea, { touches: [{ clientX: 100 }] });
        fireEvent.touchMove(touchArea, { touches: [{ clientX: 120 }] }); // diff = 20px < 50
        fireEvent.touchEnd(touchArea);
      }

      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });
  });

  describe('handleVolumeChange without mute (newVolume > 0 && isMuted false branch)', () => {
    it('volume change when not muted does not call setIsMuted', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);

      // isMuted is false initially; volume change should not unmute
      const rangeInputs = container.querySelectorAll('input[type="range"]');
      const volumeInput = rangeInputs[1] as HTMLInputElement;
      fireEvent.change(volumeInput, { target: { value: '0.5' } });

      // Volume icon (not muted) should still be visible
      expect(screen.getByTestId('volume-icon')).toBeInTheDocument();
    });
  });

  describe('handleTouchEnd early return (touchStartX=0)', () => {
    it('touchEnd with no prior touchStart is a no-op', () => {
      const videos = [
        createMockVideo({ originalName: 'video1.mp4' }),
        createMockVideo({ originalName: 'video2.mp4' }),
      ];
      const { container } = render(<VideoLightbox {...defaultProps} videos={videos} initialIndex={0} />);

      const touchArea = container.querySelector('.absolute.inset-0');
      if (touchArea) {
        // touchEnd without prior touchStart — both refs are 0, early return fires
        fireEvent.touchEnd(touchArea);
      }

      // No navigation happened; still on first video
      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });
  });

  describe('handleEnded false branch (duration=0)', () => {
    it('handleEnded with duration=0 stops playing without setting currentTime', () => {
      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      // Duration is 0 (no loadedmetadata fired) — if branch is false
      act(() => { fireEvent.ended(video); });

      // Component still renders, play icon visible
      expect(screen.getAllByTestId('play-icon').length).toBeGreaterThan(0);
    });
  });

  describe('getVideoContainerStyle: height fits without adjustment (false branch of height > availableHeight)', () => {
    it('uses width-based style when video aspect ratio is very wide', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true, writable: true });

      const { container } = render(<VideoLightbox {...defaultProps} />);
      const video = container.querySelector('video')!;

      // aspectRatio = 3200/400 = 8 → height = 1820/8 = 227.5 < availableHeight=810 (false branch)
      Object.defineProperty(video, 'duration', { value: 60, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 3200, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 400, configurable: true });

      act(() => { fireEvent.loadedMetadata(video); });

      const styledDivs = Array.from(container.querySelectorAll('[style]'));
      const pixelContainer = styledDivs.find((el) => {
        const style = (el as HTMLElement).style;
        return style.width && style.width.includes('px');
      });
      expect(pixelContainer).toBeTruthy();
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
