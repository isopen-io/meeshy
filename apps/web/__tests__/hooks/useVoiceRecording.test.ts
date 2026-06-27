/**
 * Tests for hooks/use-voice-recording.ts
 */

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceRecording, MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS } from '@/hooks/use-voice-recording';
import { toast } from 'sonner';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// MediaRecorder mock — track the most recently created instance
let lastMediaRecorder: MockMediaRecorder | null = null;

class MockMediaRecorder {
  static isTypeSupported = jest.fn(() => true);
  mimeType = 'audio/webm';
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = jest.fn((_timeslice?: number) => { this.state = 'recording'; });
  stop = jest.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  });
  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
    lastMediaRecorder = this;
  }
}

// MediaStream mock
const mockTrackStop = jest.fn();
const makeMockStream = () => ({
  getTracks: () => [{ stop: mockTrackStop }],
  getAudioTracks: () => [],
  active: true,
} as unknown as MediaStream);

// SpeechRecognition mock — track the most recently created instance
let lastSpeechRecognition: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null = null;
  start = jest.fn();
  stop = jest.fn();
  constructor() {
    lastSpeechRecognition = this;
  }
}

// AudioContext mock
const mockOscillator = {
  type: 'sine',
  frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};
const mockGain = {
  gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
  connect: jest.fn(),
};
const mockAudioCtx = {
  currentTime: 0,
  destination: {},
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGain),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();

  lastMediaRecorder = null;
  lastSpeechRecognition = null;

  // Restore commonly shared mock return values
  MockMediaRecorder.isTypeSupported.mockReturnValue(true);

  // Install global mocks
  (global as any).MediaRecorder = MockMediaRecorder;
  (window as any).AudioContext = jest.fn(() => mockAudioCtx);
  (window as any).SpeechRecognition = MockSpeechRecognition;
  delete (window as any).webkitSpeechRecognition;

  Object.defineProperty(global.navigator, 'mediaDevices', {
    writable: true,
    configurable: true,
    value: {
      getUserMedia: jest.fn(() => Promise.resolve(makeMockStream())),
    },
  });

  (URL.createObjectURL as jest.Mock) = jest.fn(() => 'blob:test-url');
  (URL.revokeObjectURL as jest.Mock) = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with isRecording false', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.isRecording).toBe(false);
  });

  it('starts with recordingTime 0', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.recordingTime).toBe(0);
  });

  it('starts with null audioBlob and audioUrl', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
  });

  it('starts with empty liveTranscript', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.liveTranscript).toBe('');
  });

  it('starts with null browserTranscription', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.browserTranscription).toBeNull();
  });

  it('exposes transcriptSegmentsRef', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );
    expect(result.current.transcriptSegmentsRef).toBeDefined();
    expect(result.current.transcriptSegmentsRef.current).toEqual([]);
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('exports MIN_RECORDING_SECONDS = 10', () => {
    expect(MIN_RECORDING_SECONDS).toBe(10);
  });

  it('exports MAX_RECORDING_SECONDS = 21', () => {
    expect(MAX_RECORDING_SECONDS).toBe(21);
  });
});

// ─── startRecording ───────────────────────────────────────────────────────────

describe('startRecording', () => {
  it('requests microphone access', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('sets isRecording to true on success', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
  });

  it('resets recordingTime to 0 when starting', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.recordingTime).toBe(0);
  });

  it('calls MediaRecorder.start()', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(lastMediaRecorder?.start).toHaveBeenCalledWith(100);
  });

  it('shows error toast when getUserMedia fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(
      new Error('Permission denied')
    );

    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(toast.error).toHaveBeenCalledWith("Impossible d'accéder au microphone");
    expect(result.current.isRecording).toBe(false);
    consoleSpy.mockRestore();
  });

  it('clears liveTranscript and browserTranscription on start', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.liveTranscript).toBe('');
    expect(result.current.browserTranscription).toBeNull();
  });

  it('starts SpeechRecognition when available', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'fr' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(lastSpeechRecognition?.start).toHaveBeenCalled();
  });

  it('sets SpeechRecognition lang for French', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'fr' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(lastSpeechRecognition?.lang).toBe('fr-FR');
  });

  it('increments recordingTime via interval', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      jest.advanceTimersByTime(500); // 5 ticks of 100ms each
    });

    // Allow state updates to flush
    await waitFor(() => {
      expect(result.current.recordingTime).toBeGreaterThan(0);
    });
  });
});

// ─── stopRecording ────────────────────────────────────────────────────────────

describe('stopRecording', () => {
  it('does nothing when not recording', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
  });

  it('sets isRecording to false after stopping', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
  });

  it('calls MediaRecorder.stop()', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(lastMediaRecorder?.stop).toHaveBeenCalled();
  });

  it('sets audioBlob and audioUrl from onstop handler', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
    });

    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(result.current.audioUrl).toBe('blob:test-url');
  });

  it('calls onRecordingComplete callback with blob and url', async () => {
    const onRecordingComplete = jest.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en', onRecordingComplete })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
    });

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.any(Blob),
      'blob:test-url'
    );
  });

  it('stops tracks on the media stream', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
    });

    expect(mockTrackStop).toHaveBeenCalled();
  });
});

// ─── resetRecording ───────────────────────────────────────────────────────────

describe('resetRecording', () => {
  it('clears audioBlob, audioUrl, and recordingTime', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
    });

    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.recordingTime).toBe(0);
  });

  it('clears liveTranscript and browserTranscription', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.liveTranscript).toBe('');
    expect(result.current.browserTranscription).toBeNull();
  });

  it('revokes the audioUrl object URL', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
    });

    act(() => {
      result.current.resetRecording();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('does not throw when no audio URL exists', () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    expect(() => {
      act(() => { result.current.resetRecording(); });
    }).not.toThrow();
  });

  it('clears transcriptSegmentsRef', async () => {
    const { result } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.transcriptSegmentsRef.current).toEqual([]);
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

describe('cleanup on unmount', () => {
  it('clears timer on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    unmount();

    // Timer should be cleared — advancing time should not cause updates
    expect(() => {
      jest.advanceTimersByTime(5000);
    }).not.toThrow();
  });

  it('stops recognition on unmount when recording', async () => {
    const { result, unmount } = renderHook(() =>
      useVoiceRecording({ sourceLanguage: 'en' })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    unmount();

    expect(lastSpeechRecognition?.stop).toHaveBeenCalled();
  });
});
