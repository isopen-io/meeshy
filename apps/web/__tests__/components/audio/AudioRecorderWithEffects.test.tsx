/**
 * Tests for AudioRecorderWithEffects component
 * Tests audio recording with effects, effects panel, and timeline tracking
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioRecorderWithEffects } from '../../../components/audio/AudioRecorderWithEffects';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'recorder.initializing': 'Initializing...',
        'recorder.audioEffects': 'Audio Effects',
        'recorder.startRecording': 'Start Recording',
        'recorder.stopRecording': 'Stop Recording',
        'recorder.maxDuration': `Max ${params?.duration || 10}min`,
        'recorder.errors.httpsRequired': 'HTTPS required',
        'recorder.errors.browserNotSupported': 'Browser not supported',
        'recorder.errors.effectsNotAvailable': 'Effects not available',
        'recorder.errors.microphoneAccessDenied': 'Microphone access denied',
        'recorder.errors.noMicrophoneFound': 'No microphone found',
        'recorder.errors.microphoneError': 'Microphone error',
        'recorder.errors.cannotAccessMicrophone': 'Cannot access microphone',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock useAudioEffects hook
const mockToggleEffect = jest.fn();
const mockUpdateEffectParams = jest.fn();
const mockLoadPreset = jest.fn();

jest.mock('@/hooks/use-audio-effects', () => ({
  useAudioEffects: () => ({
    outputStream: new MockMediaStream(),
    effectsState: {
      'voice-coder': { enabled: false, type: 'voice-coder', params: {} },
      'baby-voice': { enabled: false, type: 'baby-voice', params: {} },
      'demon-voice': { enabled: false, type: 'demon-voice', params: {} },
      'back-sound': { enabled: false, type: 'back-sound', params: {} },
    },
    toggleEffect: mockToggleEffect,
    updateEffectParams: mockUpdateEffectParams,
    loadPreset: mockLoadPreset,
    currentPreset: null,
    availableBackSounds: [],
    availablePresets: [],
  }),
}));

// Mock useAudioEffectsTimeline hook
const mockStartTracking = jest.fn();
const mockStopTracking = jest.fn().mockReturnValue({
  version: '1.0',
  createdAt: new Date().toISOString(),
  duration: 5000,
  sampleRate: 48000,
  channels: 2,
  events: [],
});
const mockRecordActivation = jest.fn();
const mockRecordDeactivation = jest.fn();
const mockRecordUpdate = jest.fn();

jest.mock('@/hooks/use-audio-effects-timeline', () => ({
  useAudioEffectsTimeline: () => ({
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    recordActivation: mockRecordActivation,
    recordDeactivation: mockRecordDeactivation,
    recordUpdate: mockRecordUpdate,
  }),
}));

// Mock AudioEffectsCarousel component
jest.mock('@/components/video-calls/AudioEffectsCarousel', () => ({
  AudioEffectsCarousel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="effects-carousel">
      <button onClick={onClose} data-testid="close-effects">Close</button>
    </div>
  ),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Square: ({ className }: { className?: string }) => (
    <span data-testid="square-icon" className={className}>■</span>
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
  Radio: ({ className }: { className?: string }) => (
    <span data-testid="radio-icon" className={className}>◉</span>
  ),
  Sliders: ({ className }: { className?: string }) => (
    <span data-testid="sliders-icon" className={className}>☰</span>
  ),
}));

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

// Mock URL methods
const mockObjectUrl = 'blob:mock-audio-url';
global.URL.createObjectURL = jest.fn().mockReturnValue(mockObjectUrl);
global.URL.revokeObjectURL = jest.fn();

// Mock performance.now
const mockPerformanceNow = jest.fn().mockReturnValue(0);
global.performance.now = mockPerformanceNow;

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn().mockImplementation((cb) => 1);
global.cancelAnimationFrame = jest.fn();

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported = jest.fn().mockReturnValue(true);

  stream: MediaStream;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: any) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock audio'], { type: 'audio/webm' }),
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
}

(global as any).MediaRecorder = MockMediaRecorder;

// Mock MediaStream
class MockMediaStream {
  private tracks: any[] = [{ stop: jest.fn(), kind: 'audio' }];

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

// Mock Audio for duration extraction
class MockAudio {
  duration = 5.5;
  src = '';

  addEventListener(event: string, callback: () => void) {
    if (event === 'loadedmetadata') {
      setTimeout(callback, 10);
    }
  }

  load() {}
}

(global as any).Audio = MockAudio;

describe('AudioRecorderWithEffects', () => {
  const defaultProps = {
    onRecordingComplete: jest.fn(),
    onRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPerformanceNow.mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('should render initial state with start button', () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      expect(screen.getByTestId('radio-icon')).toBeInTheDocument();
    });

    it('should render effects button', () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      expect(screen.getByTestId('sliders-icon')).toBeInTheDocument();
    });

    it('should render timer at 00:00.00', () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      expect(screen.getByText('00:00.00')).toBeInTheDocument();
    });

    it('should render max duration badge', () => {
      render(<AudioRecorderWithEffects {...defaultProps} maxDuration={300} />);

      expect(screen.getByText(/Max 5min/i)).toBeInTheDocument();
    });

    it('should render remove button when not recording', () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      // Remove button should be present when not recording
      const xIcon = screen.getByTestId('x-icon');
      expect(xIcon).toBeInTheDocument();
    });
  });

  describe('Effects Panel', () => {
    it('should toggle effects panel when effects button clicked', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const effectsButton = screen.getByTestId('sliders-icon').closest('button');

      await act(async () => {
        if (effectsButton) {
          fireEvent.click(effectsButton);
        }
      });

      expect(screen.getByTestId('effects-carousel')).toBeInTheDocument();
    });

    it('should close effects panel when close button clicked', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const effectsButton = screen.getByTestId('sliders-icon').closest('button');

      await act(async () => {
        if (effectsButton) {
          fireEvent.click(effectsButton);
        }
      });

      expect(screen.getByTestId('effects-carousel')).toBeInTheDocument();

      await act(async () => {
        const closeButton = screen.getByTestId('close-effects');
        fireEvent.click(closeButton);
      });

      expect(screen.queryByTestId('effects-carousel')).not.toBeInTheDocument();
    });

    it('should close effects panel when overlay clicked', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const effectsButton = screen.getByTestId('sliders-icon').closest('button');

      await act(async () => {
        if (effectsButton) {
          fireEvent.click(effectsButton);
        }
      });

      // Find and click the overlay
      const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
      if (overlay) {
        await act(async () => {
          fireEvent.click(overlay);
        });
      }

      await waitFor(() => {
        expect(screen.queryByTestId('effects-carousel')).not.toBeInTheDocument();
      });
    });
  });

  describe('Recording Flow', () => {
    it('should start recording when start button clicked', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');

      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalled();
      });
    });

    it('should show stop button when recording', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');

      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('square-icon')).toBeInTheDocument();
      });
    });

    it('should call onRecordingStateChange when recording starts', async () => {
      const onRecordingStateChange = jest.fn();
      render(
        <AudioRecorderWithEffects
          {...defaultProps}
          onRecordingStateChange={onRecordingStateChange}
        />
      );

      const startButton = screen.getByTestId('radio-icon').closest('button');

      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onRecordingStateChange).toHaveBeenCalledWith(true);
      });
    });

    it('should hide remove button when recording', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');

      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        // Remove button should be hidden (invisible or opacity-0) when recording
        const removeButton = screen.queryByTestId('x-icon')?.closest('button');
        // Either not in DOM or has opacity-0 class
        expect(
          !removeButton ||
          removeButton.classList.contains('opacity-0') ||
          removeButton.classList.contains('invisible')
        ).toBe(true);
      });
    });
  });

  describe('Stop Recording', () => {
    it('should stop recording when stop button clicked', async () => {
      const onRecordingComplete = jest.fn();
      render(
        <AudioRecorderWithEffects
          {...defaultProps}
          onRecordingComplete={onRecordingComplete}
        />
      );

      // Start recording
      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('square-icon')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByTestId('square-icon').closest('button');
      await act(async () => {
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
      render(<AudioRecorderWithEffects {...defaultProps} onStop={onStop} />);

      // Start recording
      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('square-icon')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByTestId('square-icon').closest('button');
      await act(async () => {
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onStop).toHaveBeenCalled();
      });
    });
  });

  describe('Timeline Tracking', () => {
    it('should start tracking when recording starts', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(mockStartTracking).toHaveBeenCalled();
      });
    });

    it('should stop tracking when recording stops', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      // Start recording
      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('square-icon')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByTestId('square-icon').closest('button');
      await act(async () => {
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(mockStopTracking).toHaveBeenCalled();
      });
    });

    it('should include timeline in metadata', async () => {
      const onRecordingComplete = jest.fn();
      render(
        <AudioRecorderWithEffects
          {...defaultProps}
          onRecordingComplete={onRecordingComplete}
        />
      );

      // Start recording
      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('square-icon')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByTestId('square-icon').closest('button');
      await act(async () => {
        if (stopButton) {
          fireEvent.click(stopButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onRecordingComplete).toHaveBeenCalled();
        const [, , metadata] = onRecordingComplete.mock.calls[0];
        expect(metadata).toHaveProperty('audioEffectsTimeline');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error when microphone access denied', async () => {
      mockGetUserMedia.mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByText(/denied/i)).toBeInTheDocument();
      });
    });

    it('should show error when not in secure context', async () => {
      Object.defineProperty(global.window, 'isSecureContext', {
        value: false,
        writable: true,
      });

      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
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

  describe('Remove Functionality', () => {
    it('should call onRemove when remove button clicked', async () => {
      const onRemove = jest.fn();
      render(<AudioRecorderWithEffects {...defaultProps} onRemove={onRemove} />);

      const removeButton = screen.getByTestId('x-icon').closest('button');
      await act(async () => {
        if (removeButton) {
          fireEvent.click(removeButton);
        }
      });

      expect(onRemove).toHaveBeenCalled();
    });
  });

  describe('Ref Methods', () => {
    it('should expose stopRecording method via ref', async () => {
      const ref = React.createRef<any>();
      render(<AudioRecorderWithEffects {...defaultProps} ref={ref} />);

      expect(ref.current).toBeDefined();
      expect(typeof ref.current?.stopRecording).toBe('function');
    });

    it('should expose isRecording method via ref', async () => {
      const ref = React.createRef<any>();
      render(<AudioRecorderWithEffects {...defaultProps} ref={ref} />);

      expect(typeof ref.current?.isRecording).toBe('function');
      expect(ref.current?.isRecording()).toBe(false);
    });
  });

  describe('Progress Bar', () => {
    it('should show progress bar when recording', async () => {
      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
        jest.runAllTimers();
      });

      await waitFor(() => {
        const progressBar = document.querySelector('[class*="bg-gradient-to-r"][class*="from-red-500"]');
        expect(progressBar).toBeInTheDocument();
      });
    });
  });

  describe('Initializing State', () => {
    it('should show initializing state during setup', async () => {
      // Make getUserMedia slow
      mockGetUserMedia.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(new MockMediaStream()), 1000))
      );

      render(<AudioRecorderWithEffects {...defaultProps} />);

      const startButton = screen.getByTestId('radio-icon').closest('button');
      await act(async () => {
        if (startButton) {
          fireEvent.click(startButton);
        }
      });

      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Max Duration', () => {
    it('should display correct max duration', () => {
      render(<AudioRecorderWithEffects {...defaultProps} maxDuration={120} />);

      expect(screen.getByText(/Max 2min/i)).toBeInTheDocument();
    });

    it('should enforce hard limit of 600 seconds', () => {
      render(<AudioRecorderWithEffects {...defaultProps} maxDuration={1000} />);

      expect(screen.getByText(/Max 10min/i)).toBeInTheDocument();
    });
  });
});
