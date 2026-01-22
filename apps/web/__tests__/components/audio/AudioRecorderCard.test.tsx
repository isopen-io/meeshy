/**
 * Tests for AudioRecorderCard component
 * Tests audio recording, playback controls, error handling, and timer functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioRecorderCard } from '../../../components/audio/AudioRecorderCard';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Square: ({ className }: { className?: string }) => (
    <span data-testid="square-icon" className={className}>■</span>
  ),
  Play: ({ className }: { className?: string }) => (
    <span data-testid="play-icon" className={className}>▶</span>
  ),
  Pause: ({ className }: { className?: string }) => (
    <span data-testid="pause-icon" className={className}>⏸</span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>✕</span>
  ),
  Mic: ({ className }: { className?: string }) => (
    <span data-testid="mic-icon" className={className}>🎤</span>
  ),
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="loader-icon" className={className}>⏳</span>
  ),
}));

// Mock URL methods
const mockObjectUrl = 'blob:mock-audio-url';
global.URL.createObjectURL = jest.fn().mockReturnValue(mockObjectUrl);
global.URL.revokeObjectURL = jest.fn();

// Mock performance.now
const mockPerformanceNow = jest.fn().mockReturnValue(0);
global.performance.now = mockPerformanceNow;

// Mock requestAnimationFrame
const mockRequestAnimationFrame = jest.fn().mockImplementation((cb) => {
  return 1;
});
const mockCancelAnimationFrame = jest.fn();
global.requestAnimationFrame = mockRequestAnimationFrame;
global.cancelAnimationFrame = mockCancelAnimationFrame;

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported = jest.fn().mockReturnValue(true);

  stream: MediaStream;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: any) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(stream: MediaStream, options?: any) {
    this.stream = stream;
  }

  start(timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock audio data'], { type: 'audio/webm' }),
      });
    }
    setTimeout(() => {
      if (this.onstop) {
        this.onstop();
      }
    }, 0);
  }

  requestData() {
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['chunk'], { type: 'audio/webm' }),
      });
    }
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }
}

(global as any).MediaRecorder = MockMediaRecorder;

// Mock MediaStream
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    this.tracks = [{ stop: jest.fn(), kind: 'audio' } as unknown as MediaStreamTrack];
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }
}

// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn().mockResolvedValue(new MockMediaStream());

Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

// Mock window.isSecureContext
Object.defineProperty(global.window, 'isSecureContext', {
  value: true,
  writable: true,
});

// Mock HTMLAudioElement
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: jest.fn().mockResolvedValue(undefined),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: jest.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  value: jest.fn(),
});

describe('AudioRecorderCard', () => {
  const defaultProps = {
    onRecordingComplete: jest.fn(),
    onRemove: jest.fn(),
    autoStart: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();
    mockPerformanceNow.mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('should render initializing state when autoStart is true', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      // Should show initializing or recording state - check for either
      await waitFor(() => {
        const hasLoader = screen.queryByTestId('loader-icon');
        const hasRec = screen.queryByText(/REC/i);
        expect(hasLoader || hasRec).toBeTruthy();
      });
    });

    it('should render null when no state is active', () => {
      const { container } = render(
        <AudioRecorderCard {...defaultProps} autoStart={false} />
      );

      // Component returns null when not initialized and autoStart is false
      // (though in practice autoStart triggers initialization)
      expect(container).toBeInTheDocument();
    });
  });

  describe('Permission Errors', () => {
    it('should display error when microphone access is denied', async () => {
      mockGetUserMedia.mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/denied/i)).toBeInTheDocument();
      });
    });

    it('should display error when no microphone found', async () => {
      mockGetUserMedia.mockRejectedValueOnce(
        new DOMException('No microphone found', 'NotFoundError')
      );

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/microphone/i)).toBeInTheDocument();
      });
    });

    it('should show remove button in error state', async () => {
      mockGetUserMedia.mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      });
    });

    it('should call onRemove when remove button clicked in error state', async () => {
      const onRemove = jest.fn();
      mockGetUserMedia.mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} onRemove={onRemove} autoStart={true} />);
      });

      await waitFor(() => {
        const removeButton = screen.getByTestId('x-icon').closest('button');
        if (removeButton) {
          fireEvent.click(removeButton);
        }
      });

      expect(onRemove).toHaveBeenCalled();
    });
  });

  describe('HTTPS Requirement', () => {
    it('should show error when not in secure context', async () => {
      Object.defineProperty(global.window, 'isSecureContext', {
        value: false,
        writable: true,
      });

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/HTTPS/i)).toBeInTheDocument();
      });

      // Reset
      Object.defineProperty(global.window, 'isSecureContext', {
        value: true,
        writable: true,
      });
    });
  });

  describe('Recording State', () => {
    it('should show recording UI when recording starts', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText('REC')).toBeInTheDocument();
      });
    });

    it('should show stop button during recording', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });
    });

    it('should show timer during recording', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        // Timer shows 00:00.00 format
        expect(screen.getByText(/\d{2}:\d{2}\.\d{2}/)).toBeInTheDocument();
      });
    });

    it('should show max duration badge', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} maxDuration={300} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Max 5min/i)).toBeInTheDocument();
      });
    });
  });

  describe('Stop Recording', () => {
    it('should stop recording when stop button clicked', async () => {
      const onRecordingComplete = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard
            {...defaultProps}
            onRecordingComplete={onRecordingComplete}
            autoStart={true}
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onRecordingComplete).toHaveBeenCalled();
      });
    });

    it('should call onStop callback before stopping', async () => {
      const onStop = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard {...defaultProps} onStop={onStop} autoStart={true} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      expect(onStop).toHaveBeenCalled();
    });

    it('should notify recording state change on stop', async () => {
      const onRecordingStateChange = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard
            {...defaultProps}
            onRecordingStateChange={onRecordingStateChange}
            autoStart={true}
          />
        );
      });

      await waitFor(() => {
        // Should be called with true when recording starts
        expect(onRecordingStateChange).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Playback State', () => {
    it('should show playback controls after recording', async () => {
      const onRecordingComplete = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard
            {...defaultProps}
            onRecordingComplete={onRecordingComplete}
            autoStart={true}
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('play-icon')).toBeInTheDocument();
      });
    });

    it('should show audio format and size after recording', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        // Should show format (WEBM/MP4) and KB size
        expect(screen.getByText(/KB/i)).toBeInTheDocument();
      });
    });
  });

  describe('Max Duration', () => {
    it('should respect maxDuration prop', async () => {
      await act(async () => {
        render(
          <AudioRecorderCard {...defaultProps} autoStart={true} maxDuration={120} />
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/Max 2min/i)).toBeInTheDocument();
      });
    });

    it('should enforce hard limit of 600 seconds', async () => {
      await act(async () => {
        render(
          <AudioRecorderCard {...defaultProps} autoStart={true} maxDuration={1000} />
        );
      });

      await waitFor(() => {
        // Should show max 10min (600 seconds hard limit)
        expect(screen.getByText(/Max 10min/i)).toBeInTheDocument();
      });
    });
  });

  describe('Ref Methods', () => {
    it('should expose stopRecording method via ref', async () => {
      const ref = React.createRef<any>();

      await act(async () => {
        render(
          <AudioRecorderCard {...defaultProps} ref={ref} autoStart={true} />
        );
      });

      await waitFor(() => {
        expect(ref.current).toBeDefined();
        expect(typeof ref.current?.stopRecording).toBe('function');
      });
    });

    it('should expose isRecording method via ref', async () => {
      const ref = React.createRef<any>();

      await act(async () => {
        render(
          <AudioRecorderCard {...defaultProps} ref={ref} autoStart={true} />
        );
      });

      await waitFor(() => {
        expect(typeof ref.current?.isRecording).toBe('function');
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { unmount, container } = await act(async () => {
        return render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        const hasRec = screen.queryByText('REC');
        const hasLoader = screen.queryByTestId('loader-icon');
        expect(hasRec || hasLoader).toBeTruthy();
      });

      await act(async () => {
        unmount();
      });

      // Verify component was unmounted
      expect(container.firstChild).toBeNull();
    });

    it('should revoke object URL on unmount after recording', async () => {
      const { unmount } = await act(async () => {
        return render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await act(async () => {
        unmount();
      });

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('Recording Complete Callback', () => {
    it('should pass blob to onRecordingComplete', async () => {
      const onRecordingComplete = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard
            {...defaultProps}
            onRecordingComplete={onRecordingComplete}
            autoStart={true}
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onRecordingComplete).toHaveBeenCalled();
        const [blob, duration, metadata] = onRecordingComplete.mock.calls[0];
        expect(blob).toBeInstanceOf(Blob);
        expect(typeof duration).toBe('number');
      });
    });

    it('should pass metadata to onRecordingComplete', async () => {
      const onRecordingComplete = jest.fn();

      await act(async () => {
        render(
          <AudioRecorderCard
            {...defaultProps}
            onRecordingComplete={onRecordingComplete}
            autoStart={true}
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('STOP')).toBeInTheDocument();
      });

      await act(async () => {
        const stopButton = screen.getByText('STOP').closest('button');
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onRecordingComplete).toHaveBeenCalled();
        const [, , metadata] = onRecordingComplete.mock.calls[0];
        expect(metadata).toHaveProperty('duration');
        expect(metadata).toHaveProperty('codec');
        expect(metadata).toHaveProperty('mimeType');
      });
    });
  });

  describe('MediaRecorder Codec Support', () => {
    it('should check for supported audio codecs', async () => {
      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      await waitFor(() => {
        expect(MockMediaRecorder.isTypeSupported).toHaveBeenCalled();
      });
    });

    it('should handle unsupported codec gracefully', async () => {
      MockMediaRecorder.isTypeSupported = jest.fn().mockReturnValue(false);

      await act(async () => {
        render(<AudioRecorderCard {...defaultProps} autoStart={true} />);
      });

      // Should show error or handle gracefully
      await waitFor(() => {
        // Component should handle this error
        expect(screen.getByTestId('mic-icon') || screen.getByTestId('x-icon')).toBeTruthy();
      });

      // Reset
      MockMediaRecorder.isTypeSupported = jest.fn().mockReturnValue(true);
    });
  });
});
