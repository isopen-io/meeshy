/**
 * Tests for hooks/use-voice-recording.ts
 */

jest.mock('@meeshy/shared/types/voice-api', () => ({}), { virtual: true });

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// Mock URL APIs
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock AudioContext (used by feedback sounds — we just need it not to throw)
const mockOscillatorStart = jest.fn();
const mockOscillatorStop = jest.fn();
const mockOscillatorConnect = jest.fn();
const mockOscillatorFrequency = {
  setValueAtTime: jest.fn(),
  exponentialRampToValueAtTime: jest.fn(),
};
const mockGainConnect = jest.fn();
const mockGainGain = {
  setValueAtTime: jest.fn(),
  exponentialRampToValueAtTime: jest.fn(),
};
const mockCreateOscillator = jest.fn(() => ({
  connect: mockOscillatorConnect,
  frequency: mockOscillatorFrequency,
  start: mockOscillatorStart,
  stop: mockOscillatorStop,
}));
const mockCreateGain = jest.fn(() => ({
  connect: mockGainConnect,
  gain: mockGainGain,
}));
const mockAudioContext = jest.fn(() => ({
  createOscillator: mockCreateOscillator,
  createGain: mockCreateGain,
  currentTime: 0,
  destination: {},
}));
(global as any).AudioContext = mockAudioContext;
(global as any).webkitAudioContext = mockAudioContext;

// Mock SpeechRecognition
const mockRecognitionStart = jest.fn();
const mockRecognitionStop = jest.fn();
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  start = mockRecognitionStart;
  stop = mockRecognitionStop;
}
(global as any).SpeechRecognition = MockSpeechRecognition;
(global as any).webkitSpeechRecognition = MockSpeechRecognition;

// Mock MediaRecorder
let mediaRecorderInstance: any;
const mockMediaRecorderStart = jest.fn();
const mockMediaRecorderStop = jest.fn();
class MockMediaRecorder {
  mimeType = 'audio/webm';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  start = mockMediaRecorderStart;
  stop = jest.fn(function (this: MockMediaRecorder) {
    // simulate onstop
    this.onstop?.();
  });
  static isTypeSupported = jest.fn(() => true);
  constructor(_stream: MediaStream, _opts?: any) {
    mediaRecorderInstance = this;
  }
}
(global as any).MediaRecorder = MockMediaRecorder;

// Mock getUserMedia
const mockGetUserMedia = jest.fn();
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceRecording, MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS } from '@/hooks/use-voice-recording';

const makeMockStream = () => ({
  getTracks: jest.fn(() => [{ stop: jest.fn() }]),
  getAudioTracks: jest.fn(() => [{ getSettings: jest.fn(() => ({ channelCount: 1 })) }]),
} as unknown as MediaStream);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  sourceLanguage: 'fr',
  onRecordingComplete: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMedia.mockResolvedValue(makeMockStream());
});

// ─── exported constants ───────────────────────────────────────────────────────

describe('exported constants', () => {
  it('MIN_RECORDING_SECONDS is 10', () => {
    expect(MIN_RECORDING_SECONDS).toBe(10);
  });

  it('MAX_RECORDING_SECONDS is 21', () => {
    expect(MAX_RECORDING_SECONDS).toBe(21);
  });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isRecording starts false', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.isRecording).toBe(false);
  });

  it('recordingTime starts 0', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.recordingTime).toBe(0);
  });

  it('audioBlob starts null', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.audioBlob).toBeNull();
  });

  it('audioUrl starts null', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.audioUrl).toBeNull();
  });

  it('liveTranscript starts empty string', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.liveTranscript).toBe('');
  });

  it('browserTranscription starts null', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.browserTranscription).toBeNull();
  });

  it('transcriptSegmentsRef starts as empty array', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    expect(result.current.transcriptSegmentsRef.current).toEqual([]);
  });
});

// ─── startRecording ───────────────────────────────────────────────────────────

describe('startRecording', () => {
  it('calls getUserMedia with audio:true', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('sets isRecording=true after starting', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(true);
  });

  it('resets liveTranscript on new recording start', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.liveTranscript).toBe('');
  });

  it('resets audioBlob on new recording start', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.audioBlob).toBeNull();
  });

  it('shows error toast when getUserMedia fails', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('Permission denied'));
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('microphone'));
  });

  it('does not set isRecording=true when getUserMedia fails', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(false);
  });

  it('calls onRecordingComplete with blob and url when media stops', async () => {
    const onRecordingComplete = jest.fn();
    const { result } = renderHook(() => useVoiceRecording(makeProps({ onRecordingComplete })));
    await act(async () => { await result.current.startRecording(); });
    // Trigger onstop manually
    act(() => { mediaRecorderInstance.onstop?.(); });
    expect(onRecordingComplete).toHaveBeenCalledWith(expect.any(Blob), 'blob:mock-url');
  });
});

// ─── stopRecording ────────────────────────────────────────────────────────────

describe('stopRecording', () => {
  it('sets isRecording=false when called while recording', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    act(() => { result.current.stopRecording(); });
    expect(result.current.isRecording).toBe(false);
  });

  it('does nothing when not recording', () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    // Should not throw
    expect(() => act(() => { result.current.stopRecording(); })).not.toThrow();
    expect(result.current.isRecording).toBe(false);
  });
});

// ─── resetRecording ───────────────────────────────────────────────────────────

describe('resetRecording', () => {
  it('resets all state to defaults', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    act(() => { mediaRecorderInstance.onstop?.(); });
    act(() => { result.current.resetRecording(); });
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.recordingTime).toBe(0);
    expect(result.current.liveTranscript).toBe('');
    expect(result.current.browserTranscription).toBeNull();
  });

  it('revokes the objectURL when resetting after a recording', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    act(() => { mediaRecorderInstance.onstop?.(); });
    // Now audioUrl should be 'blob:mock-url'
    act(() => { result.current.resetRecording(); });
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('resets transcriptSegmentsRef', async () => {
    const { result } = renderHook(() => useVoiceRecording(makeProps()));
    await act(async () => { await result.current.startRecording(); });
    act(() => { result.current.resetRecording(); });
    expect(result.current.transcriptSegmentsRef.current).toEqual([]);
  });
});
