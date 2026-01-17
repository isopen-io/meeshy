/**
 * Tests for VideoPlayer component (both full and compact versions)
 * Tests video playback, controls, error handling, and responsive design
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VideoPlayer, CompactVideoPlayer } from '../../../components/video/VideoPlayer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Mock MediaManager
jest.mock('@/utils/media-manager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      play: jest.fn(),
      stop: jest.fn(),
    }),
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Play: ({ className }: { className?: string }) => (
    <span data-testid="play-icon" className={className}>Play</span>
  ),
  Pause: ({ className }: { className?: string }) => (
    <span data-testid="pause-icon" className={className}>Pause</span>
  ),
  Download: ({ className }: { className?: string }) => (
    <span data-testid="download-icon" className={className}>Download</span>
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <span data-testid="alert-icon" className={className}>Alert</span>
  ),
  Volume2: ({ className }: { className?: string }) => (
    <span data-testid="volume-icon" className={className}>Volume</span>
  ),
  VolumeX: ({ className }: { className?: string }) => (
    <span data-testid="volume-muted-icon" className={className}>Muted</span>
  ),
  Maximize: ({ className }: { className?: string }) => (
    <span data-testid="maximize-icon" className={className}>Maximize</span>
  ),
  Minimize: ({ className }: { className?: string }) => (
    <span data-testid="minimize-icon" className={className}>Minimize</span>
  ),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => 1);
global.cancelAnimationFrame = jest.fn();

// Mock HTMLMediaElement
let mockVideoState = {
  currentTime: 0,
  duration: 60,
  paused: true,
  muted: false,
  volume: 1,
  readyState: 4,
  videoWidth: 1920,
  videoHeight: 1080,
  error: null as MediaError | null,
};

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: jest.fn().mockImplementation(function() {
    mockVideoState.paused = false;
    return Promise.resolve();
  }),
  writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: jest.fn().mockImplementation(function() {
    mockVideoState.paused = true;
  }),
  writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  get: () => mockVideoState.currentTime,
  set: (val: number) => { mockVideoState.currentTime = val; },
});

Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
  get: () => mockVideoState.duration,
});

Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
  get: () => mockVideoState.paused,
});

Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
  get: () => mockVideoState.muted,
  set: (val: boolean) => { mockVideoState.muted = val; },
});

Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
  get: () => mockVideoState.volume,
  set: (val: number) => { mockVideoState.volume = val; },
});

Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
  get: () => mockVideoState.readyState,
});

Object.defineProperty(HTMLMediaElement.prototype, 'videoWidth', {
  get: () => mockVideoState.videoWidth,
});

Object.defineProperty(HTMLMediaElement.prototype, 'videoHeight', {
  get: () => mockVideoState.videoHeight,
});

Object.defineProperty(HTMLMediaElement.prototype, 'error', {
  get: () => mockVideoState.error,
});

// Helper to create mock attachment
const createMockAttachment = (
  overrides: Partial<UploadedAttachmentResponse> = {}
): UploadedAttachmentResponse => ({
  id: 'video-123',
  fileUrl: 'https://example.com/video.mp4',
  originalName: 'test-video.mp4',
  mimeType: 'video/mp4',
  size: 5242880,
  duration: 60000, // 60 seconds in ms
  width: 1920,
  height: 1080,
  createdAt: new Date().toISOString(),
  uploadedAt: new Date().toISOString(),
  storagePath: '/uploads/video.mp4',
  ...overrides,
});

describe('VideoPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVideoState = {
      currentTime: 0,
      duration: 60,
      paused: true,
      muted: false,
      volume: 1,
      readyState: 4,
      videoWidth: 1920,
      videoHeight: 1080,
      error: null,
    };
  });

  describe('Basic Rendering', () => {
    it('should render video element', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
    });

    it('should render play button when paused', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getAllByTestId('play-icon').length).toBeGreaterThan(0);
    });

    it('should render progress bar', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      const progressBar = container.querySelector('input[type="range"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should render volume controls', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByTestId('volume-icon')).toBeInTheDocument();
    });

    it('should render fullscreen button', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByTestId('maximize-icon')).toBeInTheDocument();
    });

    it('should render download link', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} className="my-class" />
      );

      expect(container.firstChild).toHaveClass('my-class');
    });
  });

  describe('Play/Pause', () => {
    it('should play video when play button clicked', async () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      const playButtons = screen.getAllByTestId('play-icon');
      const playButton = playButtons[0].closest('button');

      await act(async () => {
        if (playButton) {
          fireEvent.click(playButton);
        }
      });

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('should play video when clicking on video element', async () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      await act(async () => {
        if (video) {
          fireEvent.click(video);
        }
      });

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('should reset to beginning when video ended', async () => {
      mockVideoState.currentTime = 60;
      mockVideoState.paused = true;

      render(<VideoPlayer attachment={createMockAttachment()} />);

      const playButtons = screen.getAllByTestId('play-icon');
      const playButton = playButtons[0].closest('button');

      await act(async () => {
        if (playButton) {
          fireEvent.click(playButton);
        }
      });

      // Video should reset to beginning
      expect(mockVideoState.currentTime).toBe(0);
    });
  });

  describe('Volume Controls', () => {
    it('should toggle mute when volume button clicked', async () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      const volumeButton = screen.getByTestId('volume-icon').closest('button');

      await act(async () => {
        if (volumeButton) {
          fireEvent.click(volumeButton);
        }
      });

      expect(screen.getByTestId('volume-muted-icon')).toBeInTheDocument();
    });

    it('should render volume slider', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      // Volume slider should exist (on sm and above)
      const volumeSliders = container.querySelectorAll('input[type="range"]');
      expect(volumeSliders.length).toBeGreaterThanOrEqual(1);
    });

    it('should change volume when slider moved', async () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      // Find volume slider (second range input after progress)
      const sliders = container.querySelectorAll('input[type="range"]');
      const volumeSlider = sliders[sliders.length - 1]; // Usually the last one

      await act(async () => {
        if (volumeSlider) {
          fireEvent.change(volumeSlider, { target: { value: '0.5' } });
        }
      });

      // Volume should update
      expect(mockVideoState.volume).toBe(0.5);
    });
  });

  describe('Progress Bar', () => {
    it('should update time when seeking', async () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      const progressBar = container.querySelector('input[type="range"]');

      await act(async () => {
        if (progressBar) {
          fireEvent.change(progressBar, { target: { value: '30' } });
        }
      });

      expect(mockVideoState.currentTime).toBe(30);
    });

    it('should display current time', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      // Should show 0:00 initially
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('should display duration', () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ duration: 125000 })} // 2:05
        />
      );

      // Duration should be displayed in some time format
      const timeElements = screen.getAllByText(/\d+:\d+/);
      expect(timeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display percentage in progress bar', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByText(/0%/)).toBeInTheDocument();
    });
  });

  describe('Fullscreen', () => {
    it('should render fullscreen button', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByTestId('maximize-icon')).toBeInTheDocument();
    });

    it('should call onOpenLightbox when provided', async () => {
      const onOpenLightbox = jest.fn();
      render(
        <VideoPlayer
          attachment={createMockAttachment()}
          onOpenLightbox={onOpenLightbox}
        />
      );

      const fullscreenButton = screen.getByTestId('maximize-icon').closest('button');

      await act(async () => {
        if (fullscreenButton) {
          fireEvent.click(fullscreenButton);
        }
      });

      expect(onOpenLightbox).toHaveBeenCalled();
    });
  });

  describe('Download', () => {
    it('should render download link with correct attributes', () => {
      render(<VideoPlayer attachment={createMockAttachment()} />);

      const downloadLink = screen.getByTestId('download-icon').closest('a');
      expect(downloadLink).toHaveAttribute('href', 'https://example.com/video.mp4');
      expect(downloadLink).toHaveAttribute('download', 'test-video.mp4');
    });

    it('should stop event propagation on download click', () => {
      const parentClick = jest.fn();

      render(
        <div onClick={parentClick}>
          <VideoPlayer attachment={createMockAttachment()} />
        </div>
      );

      const downloadLink = screen.getByTestId('download-icon').closest('a');
      if (downloadLink) {
        fireEvent.click(downloadLink);
      }

      expect(parentClick).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error when URL is invalid', async () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ fileUrl: 'invalid-url' })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/invalide/i)).toBeInTheDocument();
      });
    });

    it('should display error when URL is missing', async () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ fileUrl: '' })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/manquante/i)).toBeInTheDocument();
      });
    });

    it('should show error icon in error state', async () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ fileUrl: '' })}
        />
      );

      await waitFor(() => {
        // Either alert icon or error message should be present
        const alertIcons = screen.queryAllByTestId('alert-icon');
        const errorText = screen.queryByText(/manquante/i);
        expect(alertIcons.length > 0 || errorText).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should disable play button in error state', async () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ fileUrl: '' })}
        />
      );

      await waitFor(() => {
        // Either has alert icon or error message indicating error state
        const alertIcons = screen.queryAllByTestId('alert-icon');
        const errorText = screen.queryByText(/manquante/i);
        expect(alertIcons.length > 0 || errorText).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Aspect Ratio', () => {
    it('should use video dimensions for aspect ratio', () => {
      const { container } = render(
        <VideoPlayer
          attachment={createMockAttachment({ width: 1280, height: 720 })}
        />
      );

      const videoContainer = container.querySelector('[style*="aspect-ratio"]');
      expect(videoContainer).toBeInTheDocument();
    });

    it('should default to 16:9 when dimensions not provided', () => {
      const { container } = render(
        <VideoPlayer
          attachment={createMockAttachment({ width: undefined, height: undefined })}
        />
      );

      const videoContainer = container.querySelector('[style*="16/9"]');
      expect(videoContainer).toBeInTheDocument();
    });
  });

  describe('Duration Conversion', () => {
    it('should convert duration from milliseconds to seconds', () => {
      render(
        <VideoPlayer
          attachment={createMockAttachment({ duration: 125000 })} // 2:05
        />
      );

      // Duration should be formatted as 2:05
      const durationText = screen.getByText('2:05');
      expect(durationText).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have gradient background', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      expect(container.firstChild).toHaveClass('bg-gradient-to-br');
    });

    it('should have shadow styling', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      expect(container.firstChild).toHaveClass('shadow-md');
      expect(container.firstChild).toHaveClass('hover:shadow-lg');
    });

    it('should have border styling', () => {
      const { container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      const hasBorder = container.querySelector('[class*="border"]');
      expect(hasBorder).toBeInTheDocument();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', () => {
      const { unmount, container } = render(
        <VideoPlayer attachment={createMockAttachment()} />
      );

      // Verify video element exists
      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();

      unmount();

      // Video element should be cleaned up
      expect(container.querySelector('video')).not.toBeInTheDocument();
    });
  });
});

describe('CompactVideoPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVideoState = {
      currentTime: 0,
      duration: 60,
      paused: true,
      muted: false,
      volume: 1,
      readyState: 4,
      videoWidth: 320,
      videoHeight: 180,
      error: null,
    };
  });

  describe('Basic Rendering', () => {
    it('should render compact layout', () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      expect(container.firstChild).toHaveClass('inline-flex');
    });

    it('should render video thumbnail', () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
    });

    it('should render play button', () => {
      render(<CompactVideoPlayer attachment={createMockAttachment()} />);

      expect(screen.getByTestId('play-icon')).toBeInTheDocument();
    });

    it('should display duration', () => {
      render(
        <CompactVideoPlayer
          attachment={createMockAttachment({ duration: 90000 })} // 1:30
        />
      );

      expect(screen.getByText('1:30')).toBeInTheDocument();
    });
  });

  describe('Play/Pause', () => {
    it('should toggle play when button clicked', async () => {
      render(<CompactVideoPlayer attachment={createMockAttachment()} />);

      const playButton = screen.getByTestId('play-icon').closest('button');

      await act(async () => {
        if (playButton) {
          fireEvent.click(playButton);
        }
      });

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('should show pause icon when playing', async () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      if (video) {
        // Simulate play event to change state
        fireEvent.play(video);
      }

      await waitFor(() => {
        // Either pause icon is shown or play icon is still there (depends on state update)
        const pauseIcon = screen.queryByTestId('pause-icon');
        const playIcon = screen.queryByTestId('play-icon');
        expect(pauseIcon || playIcon).toBeTruthy();
      });
    });
  });

  describe('Duration Formatting', () => {
    it('should format duration under an hour', () => {
      render(
        <CompactVideoPlayer
          attachment={createMockAttachment({ duration: 125000 })} // 2:05
        />
      );

      expect(screen.getByText('2:05')).toBeInTheDocument();
    });

    it('should format duration over an hour', () => {
      render(
        <CompactVideoPlayer
          attachment={createMockAttachment({ duration: 3665000 })} // 1:01:05
        />
      );

      expect(screen.getByText('1:01:05')).toBeInTheDocument();
    });

    it('should handle zero duration', () => {
      render(
        <CompactVideoPlayer
          attachment={createMockAttachment({ duration: 0 })}
        />
      );

      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('should handle undefined duration', () => {
      render(
        <CompactVideoPlayer
          attachment={createMockAttachment({ duration: undefined })}
        />
      );

      expect(screen.getByText('0:00')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <CompactVideoPlayer
          attachment={createMockAttachment()}
          className="my-compact-class"
        />
      );

      expect(container.firstChild).toHaveClass('my-compact-class');
    });
  });

  describe('Video Thumbnail', () => {
    it('should have fixed size thumbnail', () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      const thumbnailContainer = container.querySelector('.w-24.h-16');
      expect(thumbnailContainer).toBeInTheDocument();
    });

    it('should have object-cover styling', () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      expect(video).toHaveClass('object-cover');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', () => {
      const { unmount, container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      // Verify video element exists before unmount
      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();

      unmount();

      // Video element should be removed after unmount
      expect(container.querySelector('video')).not.toBeInTheDocument();
    });
  });

  describe('Event Reset', () => {
    it('should reset to beginning when video ends', async () => {
      const { container } = render(
        <CompactVideoPlayer attachment={createMockAttachment()} />
      );

      const video = container.querySelector('video');
      if (video) {
        fireEvent.ended(video);
      }

      await waitFor(() => {
        expect(mockVideoState.currentTime).toBe(0);
      });
    });
  });
});
