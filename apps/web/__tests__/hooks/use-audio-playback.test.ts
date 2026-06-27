/**
 * Tests for hooks/use-audio-playback.ts
 */

const mockGetBlob = jest.fn();
const mockPost = jest.fn();
jest.mock('@/services/api.service', () => ({
  apiService: {
    getBlob: (...args: unknown[]) => mockGetBlob(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

const mockMediaPlay = jest.fn();
const mockMediaStop = jest.fn();
jest.mock('@/utils/media-manager', () => {
  const instance = {
    play: (...args: unknown[]) => mockMediaPlay(...args),
    stop: (...args: unknown[]) => mockMediaStop(...args),
  };
  return {
    default: {
      getInstance: jest.fn(() => instance),
    },
  };
});

const mockCreateObjectURL = jest.fn(() => 'blob:audio-url');
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioPlayback } from '@/hooks/use-audio-playback';

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  audioUrl: '/api/v1/audio/test.webm',
  attachmentId: 'att-1',
  ...overrides,
});

const makeBlob = () => new Blob(['audio-data'], { type: 'audio/webm' });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBlob.mockResolvedValue(makeBlob());
  mockPost.mockResolvedValue({ success: true });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isPlaying starts false', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.isPlaying).toBe(false);
  });

  it('isLoading becomes false after blob resolves', async () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('hasError starts false', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.hasError).toBe(false);
  });

  it('errorMessage starts empty', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.errorMessage).toBe('');
  });

  it('currentTime starts 0', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.currentTime).toBe(0);
  });

  it('duration starts 0', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.duration).toBe(0);
  });

  it('objectUrl starts null', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.objectUrl).toBeNull();
  });

  it('playbackRate starts 1.0', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.playbackRate).toBe(1.0);
  });

  it('audioRef is exposed', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    expect(result.current.audioRef).toBeDefined();
  });
});

// ─── audio loading ────────────────────────────────────────────────────────────

describe('audio loading', () => {
  it('calls apiService.getBlob with the audioUrl path', async () => {
    renderHook(() => useAudioPlayback(makeProps({ audioUrl: '/api/v1/audio/file.webm' })));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalled());
    expect(mockGetBlob).toHaveBeenCalledWith('/api/v1/audio/file.webm');
  });

  it('extracts pathname from absolute URLs before calling getBlob', async () => {
    renderHook(() => useAudioPlayback(makeProps({ audioUrl: 'https://gate.meeshy.me/api/v1/audio/file.webm' })));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalled());
    expect(mockGetBlob).toHaveBeenCalledWith('/api/v1/audio/file.webm');
  });

  it('creates objectUrl from blob on success', async () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.objectUrl).toBe('blob:audio-url'));
  });

  it('sets isLoading=false after blob loads', async () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets hasError=true when audioUrl is empty', async () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps({ audioUrl: '' })));
    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  it('sets hasError=true on 404 error', async () => {
    mockGetBlob.mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  it('sets errorMessage for 404', async () => {
    mockGetBlob.mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.errorMessage).toMatch(/introuvable/i));
  });

  it('sets errorMessage for 500', async () => {
    mockGetBlob.mockRejectedValue({ status: 500 });
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.errorMessage).toMatch(/serveur/i));
  });

  it('sets errorMessage for TIMEOUT', async () => {
    mockGetBlob.mockRejectedValue({ code: 'TIMEOUT' });
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.errorMessage).toMatch(/timeout/i));
  });

  it('sets generic errorMessage on unknown error', async () => {
    mockGetBlob.mockRejectedValue(new Error('unknown'));
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await waitFor(() => expect(result.current.errorMessage).toMatch(/chargement/i));
  });
});

// ─── attachmentDuration effect ─────────────────────────────────────────────────

describe('attachmentDuration', () => {
  it('sets duration from attachmentDuration when provided', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps({ attachmentDuration: 42 })));
    expect(result.current.duration).toBe(42);
  });

  it('does not set duration when attachmentDuration is 0', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps({ attachmentDuration: 0 })));
    expect(result.current.duration).toBe(0);
  });

  it('updates duration when attachmentDuration changes', async () => {
    const { result, rerender } = renderHook(
      ({ dur }) => useAudioPlayback(makeProps({ attachmentDuration: dur })),
      { initialProps: { dur: 10 } }
    );
    expect(result.current.duration).toBe(10);
    rerender({ dur: 30 });
    expect(result.current.duration).toBe(30);
  });
});

// ─── setPlaybackRate ──────────────────────────────────────────────────────────

describe('setPlaybackRate', () => {
  it('updates playbackRate state', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    act(() => { result.current.setPlaybackRate(1.5); });
    expect(result.current.playbackRate).toBe(1.5);
  });

  it('can be set to 2x', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    act(() => { result.current.setPlaybackRate(2); });
    expect(result.current.playbackRate).toBe(2);
  });
});

// ─── togglePlay without objectUrl ────────────────────────────────────────────

describe('togglePlay — no audio loaded', () => {
  it('sets hasError=true when no objectUrl', async () => {
    // Don't wait for blob to load
    mockGetBlob.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await act(async () => { await result.current.togglePlay(); });
    expect(result.current.hasError).toBe(true);
  });

  it('sets errorMessage when no objectUrl', async () => {
    mockGetBlob.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    await act(async () => { await result.current.togglePlay(); });
    expect(result.current.errorMessage).toBe('Audio non chargé');
  });
});

// ─── handleEnded ──────────────────────────────────────────────────────────────

describe('handleEnded', () => {
  it('sets isPlaying=false', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    // Simulate a playing state then call handleEnded
    act(() => { result.current.handleEnded(); });
    expect(result.current.isPlaying).toBe(false);
  });

  it('resets currentTime to 0 (audioRef is null, so currentTime stays 0)', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    act(() => { result.current.handleEnded(); });
    expect(result.current.currentTime).toBe(0);
  });

  it('calls trackConsumption for non-own messages', async () => {
    mockPost.mockResolvedValue({ success: true });
    const { result } = renderHook(() =>
      useAudioPlayback(makeProps({ attachmentId: 'att-2', isOwnMessage: false }))
    );
    act(() => { result.current.handleEnded(); });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      '/attachments/att-2/status',
      expect.objectContaining({ action: 'listened', complete: true })
    );
  });

  it('does not call trackConsumption for own messages', () => {
    const { result } = renderHook(() =>
      useAudioPlayback(makeProps({ isOwnMessage: true }))
    );
    act(() => { result.current.handleEnded(); });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ─── handleSeekToTime ─────────────────────────────────────────────────────────

describe('handleSeekToTime', () => {
  it('does nothing when time is negative', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    act(() => { result.current.handleSeekToTime(-1); });
    expect(result.current.currentTime).toBe(0);
  });

  it('does nothing when audioRef is null', () => {
    const { result } = renderHook(() => useAudioPlayback(makeProps()));
    // audioRef.current is null in renderHook, so this should be a no-op
    act(() => { result.current.handleSeekToTime(5); });
    // currentTime remains 0 since audioRef.current is null
    expect(result.current.currentTime).toBe(0);
  });
});

// ─── reloads on attachmentId change ──────────────────────────────────────────

describe('reloads on attachmentId change', () => {
  it('calls getBlob again when attachmentId changes', async () => {
    const { rerender } = renderHook(
      ({ id }) => useAudioPlayback(makeProps({ attachmentId: id })),
      { initialProps: { id: 'att-1' } }
    );
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledTimes(1));
    rerender({ id: 'att-2' });
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledTimes(2));
  });
});
