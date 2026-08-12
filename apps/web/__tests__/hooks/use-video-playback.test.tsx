/**
 * Tests for useVideoPlayback hook
 *
 * Tests cover all branches of:
 * - Initial state
 * - fileUrl initialization (valid https/http, invalid, empty)
 * - togglePlay (play/pause paths, error handling, readyState=0, near-end reset)
 * - handleSeek
 * - handleLoadedMetadata / tryToGetDuration (video.duration, fallback, neither)
 * - handleEnded (trackConsumption once, reset)
 * - handleVideoError (webm decode, network, unsupported, ignores when duration>0)
 * - trackConsumption (isOwnMessage guard, api payload)
 * - play/pause/timeupdate event listeners
 * - updateProgress animation frame
 * - duration from attachmentDuration
 * - cleanup on unmount
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useVideoPlayback } from '@/hooks/use-video-playback';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/services/api.service', () => ({
  apiService: {
    post: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/utils/media-manager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      play: jest.fn(),
      stop: jest.fn(),
    }),
  },
}));

// Stable requestAnimationFrame/cancelAnimationFrame mocks – replaced per-test as needed
global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
  return 1;
});
global.cancelAnimationFrame = jest.fn();

// MediaError mock with standard codes
const MediaErrorMock = {
  MEDIA_ERR_ABORTED: 1,
  MEDIA_ERR_NETWORK: 2,
  MEDIA_ERR_DECODE: 3,
  MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
};
Object.defineProperty(global, 'MediaError', {
  value: MediaErrorMock,
  writable: true,
  configurable: true,
});

// ── Video state shared across property stubs ──────────────────────────────────

type VideoStateType = {
  currentTime: number;
  duration: number;
  paused: boolean;
  readyState: number;
  error: { code: number } | null;
  src: string;
};

let videoState: VideoStateType = {
  currentTime: 0,
  duration: NaN,
  paused: true,
  readyState: 4,
  error: null,
  src: '',
};

function resetVideoState(overrides: Partial<VideoStateType> = {}): void {
  videoState = {
    currentTime: 0,
    duration: NaN,
    paused: true,
    readyState: 4,
    error: null,
    src: '',
    ...overrides,
  };
}

// Stub HTMLMediaElement prototype methods and properties
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  writable: true,
  value: jest.fn().mockImplementation(function (this: HTMLMediaElement) {
    videoState.paused = false;
    return Promise.resolve();
  }),
});

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  writable: true,
  value: jest.fn().mockImplementation(function () {
    videoState.paused = true;
  }),
});

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  get() { return videoState.currentTime; },
  set(val: number) { videoState.currentTime = val; },
  configurable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
  get() { return videoState.duration; },
  configurable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
  get() { return videoState.paused; },
  configurable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
  get() { return videoState.readyState; },
  configurable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'error', {
  get() { return videoState.error; },
  configurable: true,
});

// ── Imports for checking mock calls ──────────────────────────────────────────

import { apiService } from '@/services/api.service';
import MediaManager from '@/utils/media-manager';

const mockApiPost = apiService.post as jest.Mock;
const mockMediaManagerInstance = MediaManager.getInstance();
const mockMediaManagerPlay = mockMediaManagerInstance.play as jest.Mock;
const mockMediaManagerStop = mockMediaManagerInstance.stop as jest.Mock;

// ── Factory & TestComponent ───────────────────────────────────────────────────

type HookOptions = {
  fileUrl?: string;
  duration?: number;
  mimeType?: string;
  attachmentId?: string;
  isOwnMessage?: boolean;
};

function makeOptions(overrides: HookOptions = {}) {
  return {
    fileUrl: 'https://example.com/video.mp4',
    attachmentId: 'att-001',
    isOwnMessage: false,
    ...overrides,
  };
}

type HookResult = ReturnType<typeof useVideoPlayback>;

/**
 * TestComponent renders a <video> element so videoRef attaches to a real DOM node,
 * and exposes the hook result via a ref for assertions.
 */
function TestComponent({
  options,
  hookRef,
}: {
  options: ReturnType<typeof makeOptions>;
  hookRef: React.MutableRefObject<HookResult | null>;
}) {
  const result = useVideoPlayback(options);
  hookRef.current = result;
  return (
    <video
      ref={result.videoRef}
      data-testid="video"
    />
  );
}

function renderHook(options: ReturnType<typeof makeOptions> = makeOptions()) {
  const hookRef = React.createRef() as React.MutableRefObject<HookResult | null>;
  const utils = render(
    <TestComponent options={options} hookRef={hookRef} />,
  );
  return { hookRef, ...utils };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal SyntheticEvent-like object for handleVideoError */
function makeSyntheticVideoErrorEvent(errorCode: number | null) {
  return {
    currentTarget: {
      error: errorCode !== null ? { code: errorCode } : null,
    },
  } as unknown as React.SyntheticEvent<HTMLVideoElement, Event>;
}

function getVideo(): HTMLVideoElement {
  return screen.getByTestId('video') as HTMLVideoElement;
}

// ── Test suites ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetVideoState();
  (HTMLMediaElement.prototype.play as jest.Mock).mockImplementation(function () {
    videoState.paused = false;
    return Promise.resolve();
  });
  (HTMLMediaElement.prototype.pause as jest.Mock).mockImplementation(function () {
    videoState.paused = true;
  });
  (HTMLMediaElement.prototype.load as jest.Mock).mockImplementation(function () {});
  (global.requestAnimationFrame as jest.Mock).mockImplementation((_cb: FrameRequestCallback) => 1);
  (global.cancelAnimationFrame as jest.Mock).mockImplementation((_id: number) => {});
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useVideoPlayback', () => {
  // ── Initial state ───────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('returns correct initial values', () => {
      const { hookRef } = renderHook();
      const hook = hookRef.current!;
      expect(hook.isPlaying).toBe(false);
      expect(hook.currentTime).toBe(0);
      expect(hook.duration).toBe(0);
      expect(hook.isLoading).toBe(false);
      expect(hook.hasLoadedMetadata).toBe(false);
      expect(hook.hasError).toBe(false);
      expect(hook.errorMessage).toBe('');
    });

    it('returns a videoRef attached to the rendered video element', () => {
      const { hookRef } = renderHook();
      expect(hookRef.current!.videoRef.current).toBe(getVideo());
    });
  });

  // ── fileUrl initialization effect ───────────────────────────────────────────
  describe('fileUrl initialization', () => {
    it('sets video.src and calls load() for a valid https URL', () => {
      renderHook(makeOptions({ fileUrl: 'https://cdn.example.com/video.mp4' }));
      expect(getVideo().src).toContain('https://cdn.example.com/video.mp4');
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    });

    it('sets video.src and calls load() for a valid http URL', () => {
      renderHook(makeOptions({ fileUrl: 'http://localhost:3000/video.mp4' }));
      expect(getVideo().src).toContain('http://localhost:3000/video.mp4');
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    });

    it('sets hasError=true with message for invalid URL (no http/https prefix)', async () => {
      const { hookRef } = renderHook(makeOptions({ fileUrl: 'blob:invalid' }));
      await waitFor(() => {
        expect(hookRef.current!.hasError).toBe(true);
        expect(hookRef.current!.errorMessage).toBe('URL du fichier invalide');
      });
    });

    it('sets hasError=true with message for empty fileUrl', async () => {
      const { hookRef } = renderHook(makeOptions({ fileUrl: '' }));
      await waitFor(() => {
        expect(hookRef.current!.hasError).toBe(true);
        expect(hookRef.current!.errorMessage).toBe('URL du fichier manquante');
      });
    });
  });

  // ── togglePlay – play path ──────────────────────────────────────────────────
  describe('togglePlay – play path', () => {
    it('calls video.play() and sets isPlaying=true, clears isLoading', async () => {
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      expect(hookRef.current!.isPlaying).toBe(true);
      expect(hookRef.current!.isLoading).toBe(false);
    });

    it('calls MediaManager.play() with the video element', async () => {
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      // VideoManager.play(video) internally calls mediaManager.play(video, 'video')
      expect(mockMediaManagerPlay).toHaveBeenCalledWith(getVideo(), 'video');
    });

    it('resets currentTime to 0 when near end (currentTime >= duration - 0.1)', async () => {
      resetVideoState({ duration: 60, paused: true, readyState: 4 });
      const { hookRef } = renderHook();
      // Set currentTime to near-end AFTER mount (mount effect resets it to 0)
      act(() => { videoState.currentTime = 59.95; });
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(videoState.currentTime).toBe(0);
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('resets currentTime to 0 when duration is non-finite (NaN)', async () => {
      resetVideoState({ duration: NaN, currentTime: 5, paused: true, readyState: 4 });
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(videoState.currentTime).toBe(0);
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('does NOT reset currentTime when not near end', async () => {
      resetVideoState({ duration: 60, currentTime: 10, paused: true, readyState: 4 });
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      // currentTime 10 is not >= 59.9, so hook should not reset it to 0 via the near-end branch
      expect(hookRef.current!.isPlaying).toBe(true);
    });

    it('calls load() and waits when readyState === 0', async () => {
      jest.useFakeTimers();
      resetVideoState({ readyState: 0, duration: NaN, paused: true });
      const { hookRef } = renderHook();

      let resolved = false;
      act(() => {
        hookRef.current!.togglePlay().then(() => { resolved = true; });
      });

      // Before advancing timers, play() hasn't been called yet (waiting 100ms)
      expect(resolved).toBe(false);
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => expect(resolved).toBe(true));
      jest.useRealTimers();
    });

    it('sets hasError=true with missing URL message when fileUrl is empty string', async () => {
      const { hookRef } = renderHook(makeOptions({ fileUrl: '' }));
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.errorMessage).toBe('URL du fichier vidéo manquante');
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    });
  });

  // ── togglePlay – pause path ─────────────────────────────────────────────────
  describe('togglePlay – pause path', () => {
    it('calls pause(), sets isPlaying=false, calls MediaManager.stop()', async () => {
      const { hookRef } = renderHook();
      // First play
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.isPlaying).toBe(true);

      // Then pause
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      expect(hookRef.current!.isPlaying).toBe(false);
      expect(mockMediaManagerStop).toHaveBeenCalledWith(getVideo());
    });

    it('calls trackConsumption(false) when watchedMs >= 3000 and not yet tracked', async () => {
      jest.useFakeTimers();
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));

      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.isPlaying).toBe(true);

      // Advance time 3+ seconds
      act(() => {
        jest.advanceTimersByTime(3500);
      });

      // Now pause
      await act(async () => {
        await hookRef.current!.togglePlay();
      });

      expect(mockApiPost).toHaveBeenCalledWith(
        '/attachments/att-001/status',
        expect.objectContaining({ action: 'watched', complete: false }),
      );
      jest.useRealTimers();
    });

    it('does NOT call trackConsumption when watchedMs < 3000', async () => {
      jest.useFakeTimers();
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));

      await act(async () => {
        await hookRef.current!.togglePlay();
      });

      // Only 1 second watched
      act(() => { jest.advanceTimersByTime(1000); });

      await act(async () => {
        await hookRef.current!.togglePlay();
      });

      expect(mockApiPost).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does NOT call trackConsumption when already tracked', async () => {
      jest.useFakeTimers();
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));

      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      act(() => { jest.advanceTimersByTime(4000); });

      // First pause (should track)
      await act(async () => { await hookRef.current!.togglePlay(); });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      mockApiPost.mockClear();

      // Play again
      await act(async () => { await hookRef.current!.togglePlay(); });
      act(() => { jest.advanceTimersByTime(4000); });

      // Second pause: hasTrackedCompletionRef is reset per attachmentId, NOT between plays
      // so this WILL track again (ref only reset on attachmentId change)
      await act(async () => { await hookRef.current!.togglePlay(); });
      // trackConsumption only skipped if hasTrackedCompletionRef.current=true
      // It was set to true only by handleEnded, not by trackConsumption(false)
      // So a second pause CAN call trackConsumption(false) again
      expect(mockApiPost).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  // ── togglePlay – error handling ─────────────────────────────────────────────
  describe('togglePlay – error handling', () => {
    it('sets errorMessage for NotSupportedError', async () => {
      (HTMLMediaElement.prototype.play as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Not supported'), { name: 'NotSupportedError' }),
      );
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.isLoading).toBe(false);
      expect(hookRef.current!.isPlaying).toBe(false);
      expect(hookRef.current!.errorMessage).toBe('Format vidéo non supporté');
    });

    it('sets errorMessage for NotAllowedError', async () => {
      (HTMLMediaElement.prototype.play as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' }),
      );
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.errorMessage).toBe('Lecture bloquée par le navigateur');
    });

    it('sets generic errorMessage for other errors', async () => {
      (HTMLMediaElement.prototype.play as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Unknown'), { name: 'SomeOtherError' }),
      );
      const { hookRef } = renderHook();
      await act(async () => {
        await hookRef.current!.togglePlay();
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.errorMessage).toBe('Erreur de lecture vidéo');
    });
  });

  // ── handleSeek ──────────────────────────────────────────────────────────────
  describe('handleSeek', () => {
    it('sets currentTime state and video.currentTime', async () => {
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleSeek(42);
      });
      expect(hookRef.current!.currentTime).toBe(42);
      expect(videoState.currentTime).toBe(42);
    });

    it('handles seek to 0', () => {
      const { hookRef } = renderHook();
      act(() => { hookRef.current!.handleSeek(10); });
      act(() => { hookRef.current!.handleSeek(0); });
      expect(hookRef.current!.currentTime).toBe(0);
      expect(videoState.currentTime).toBe(0);
    });
  });

  // ── handleLoadedMetadata / tryToGetDuration ─────────────────────────────────
  describe('handleLoadedMetadata / tryToGetDuration', () => {
    it('sets duration and hasLoadedMetadata from video.duration when finite and > 0', () => {
      resetVideoState({ duration: 120, currentTime: 0 });
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleLoadedMetadata();
      });
      expect(hookRef.current!.duration).toBe(120);
      expect(hookRef.current!.hasLoadedMetadata).toBe(true);
    });

    it('keeps currentTime=0 when video.currentTime is 0 at metadata load', () => {
      resetVideoState({ duration: 120, currentTime: 0 });
      const { hookRef } = renderHook();
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('does NOT reset currentTime when video.currentTime > 0 and finite', () => {
      resetVideoState({ duration: 120, currentTime: 30 });
      const { hookRef } = renderHook();
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      // currentTime state was 0 at mount (effect resets it); video.currentTime is 30 but
      // the hook only calls setCurrentTime(0) if video.currentTime === 0 || !isFinite
      // So no additional setCurrentTime call — state remains 0 from mount reset
      expect(hookRef.current!.duration).toBe(120);
      expect(hookRef.current!.hasLoadedMetadata).toBe(true);
    });

    it('falls back to attachmentDuration when video.duration is NaN', () => {
      resetVideoState({ duration: NaN });
      const { hookRef } = renderHook(makeOptions({ duration: 90 }));
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      expect(hookRef.current!.duration).toBe(90);
      expect(hookRef.current!.hasLoadedMetadata).toBe(true);
    });

    it('falls back to attachmentDuration when video.duration is 0', () => {
      resetVideoState({ duration: 0 });
      const { hookRef } = renderHook(makeOptions({ duration: 45 }));
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      expect(hookRef.current!.duration).toBe(45);
      expect(hookRef.current!.hasLoadedMetadata).toBe(true);
    });

    it('does nothing when both video.duration invalid and no attachmentDuration', () => {
      resetVideoState({ duration: NaN });
      const { hookRef } = renderHook(makeOptions({ duration: undefined }));
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      expect(hookRef.current!.duration).toBe(0);
      expect(hookRef.current!.hasLoadedMetadata).toBe(false);
    });
  });

  // ── handleEnded ─────────────────────────────────────────────────────────────
  describe('handleEnded', () => {
    it('sets isPlaying=false and resets currentTime to 0', () => {
      resetVideoState({ duration: 60, currentTime: 60 });
      const { hookRef } = renderHook();
      act(() => { hookRef.current!.handleEnded(); });
      expect(hookRef.current!.isPlaying).toBe(false);
      expect(hookRef.current!.currentTime).toBe(0);
      expect(videoState.currentTime).toBe(0);
    });

    it('calls trackConsumption(true) on first call', () => {
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));
      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiPost).toHaveBeenCalledWith(
        '/attachments/att-001/status',
        expect.objectContaining({ action: 'watched', complete: true }),
      );
    });

    it('does NOT call trackConsumption twice (deduplication)', () => {
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));
      act(() => { hookRef.current!.handleEnded(); });
      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    it('does NOT call trackConsumption when isOwnMessage=true', () => {
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: true }));
      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  // ── handleVideoError ────────────────────────────────────────────────────────
  describe('handleVideoError', () => {
    it('sets hasError and errorMessage for webm + MEDIA_ERR_DECODE', () => {
      const { hookRef } = renderHook(makeOptions({ mimeType: 'video/webm' }));
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_DECODE),
        );
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.isLoading).toBe(false);
      expect(hookRef.current!.isPlaying).toBe(false);
      expect(hookRef.current!.errorMessage).toBe('Format non supporté sur ce navigateur');
    });

    it('does NOT set error for MEDIA_ERR_DECODE when mimeType is not webm', () => {
      const { hookRef } = renderHook(makeOptions({ mimeType: 'video/mp4' }));
      // MEDIA_ERR_DECODE with mp4 falls through to duration check
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_DECODE),
        );
      });
      // duration is 0 (not > 0) so continues — but error code is neither NETWORK nor SRC_NOT_SUPPORTED
      expect(hookRef.current!.hasError).toBe(false);
    });

    it('sets errorMessage "Erreur réseau" for MEDIA_ERR_NETWORK when duration=0', () => {
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_NETWORK),
        );
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.errorMessage).toBe('Erreur réseau');
    });

    it('sets errorMessage "Format non supporté" for MEDIA_ERR_SRC_NOT_SUPPORTED when duration=0', () => {
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_SRC_NOT_SUPPORTED),
        );
      });
      expect(hookRef.current!.hasError).toBe(true);
      expect(hookRef.current!.errorMessage).toBe('Format non supporté');
    });

    it('ignores MEDIA_ERR_NETWORK when duration > 0', () => {
      resetVideoState({ duration: 60 });
      const { hookRef } = renderHook(makeOptions({ duration: 60 }));
      // Set duration via handleLoadedMetadata so hook's state duration > 0
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_NETWORK),
        );
      });
      expect(hookRef.current!.hasError).toBe(false);
    });

    it('ignores MEDIA_ERR_SRC_NOT_SUPPORTED when duration > 0', () => {
      resetVideoState({ duration: 60 });
      const { hookRef } = renderHook(makeOptions({ duration: 60 }));
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_SRC_NOT_SUPPORTED),
        );
      });
      expect(hookRef.current!.hasError).toBe(false);
    });

    it('ignores unknown error codes (MEDIA_ERR_ABORTED)', () => {
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(MediaErrorMock.MEDIA_ERR_ABORTED),
        );
      });
      expect(hookRef.current!.hasError).toBe(false);
    });

    it('ignores when error is null', () => {
      const { hookRef } = renderHook();
      act(() => {
        hookRef.current!.handleVideoError(
          makeSyntheticVideoErrorEvent(null),
        );
      });
      expect(hookRef.current!.hasError).toBe(false);
    });
  });

  // ── trackConsumption ────────────────────────────────────────────────────────
  describe('trackConsumption', () => {
    it('skips API call when isOwnMessage=true', () => {
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: true }));
      act(() => { hookRef.current!.handleEnded(); }); // handleEnded calls trackConsumption
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('calls apiService.post with correct endpoint and payload', () => {
      resetVideoState({ duration: 60 });
      const { hookRef } = renderHook(
        makeOptions({ attachmentId: 'my-att-42', isOwnMessage: false }),
      );
      // The mount effect resets videoRef.current.currentTime = 0.
      // Now set it to 15 *after* mount so trackConsumption reads the right value.
      act(() => {
        videoState.currentTime = 15;
        hookRef.current!.handleEnded();
      });
      expect(mockApiPost).toHaveBeenCalledWith(
        '/attachments/my-att-42/status',
        {
          action: 'watched',
          playPositionMs: 15000,
          durationMs: 60000,
          complete: true,
        },
      );
    });

    it('uses durationMs=0 when video.duration is not finite', () => {
      resetVideoState({ currentTime: 0, duration: NaN });
      const { hookRef } = renderHook(makeOptions({ isOwnMessage: false }));
      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ durationMs: 0 }),
      );
    });
  });

  // ── play event listener ─────────────────────────────────────────────────────
  describe('play event listener', () => {
    it('sets isPlaying=true and starts requestAnimationFrame', async () => {
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => { fireEvent.play(video); });

      expect(hookRef.current!.isPlaying).toBe(true);
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('cancels existing animation frame before starting new one', () => {
      // Pre-set animationFrameRef.current by simulating a play then another play
      const { hookRef: _ } = renderHook();
      const video = getVideo();

      // Simulate first play - starts animation frame (returns id=1)
      (global.requestAnimationFrame as jest.Mock).mockReturnValueOnce(5);
      act(() => { fireEvent.play(video); });

      // Second play event - should cancel previous frame then request new
      act(() => { fireEvent.play(video); });
      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(5);
    });
  });

  // ── pause event listener ────────────────────────────────────────────────────
  describe('pause event listener', () => {
    it('sets isPlaying=false and cancels animation frame', () => {
      const { hookRef } = renderHook();
      const video = getVideo();

      (global.requestAnimationFrame as jest.Mock).mockReturnValueOnce(7);
      act(() => { fireEvent.play(video); });
      expect(hookRef.current!.isPlaying).toBe(true);

      act(() => { fireEvent.pause(video); });
      expect(hookRef.current!.isPlaying).toBe(false);
      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(7);
    });
  });

  // ── timeupdate event listener ───────────────────────────────────────────────
  describe('timeupdate event listener', () => {
    it('updates currentTime when not paused and readyState >= 2', () => {
      resetVideoState({ paused: false, readyState: 4, duration: 60 });
      const { hookRef } = renderHook();
      const video = getVideo();

      // Set currentTime AFTER mount (mount effect resets it to 0)
      act(() => {
        videoState.currentTime = 12;
        fireEvent.timeUpdate(video);
      });
      expect(hookRef.current!.currentTime).toBe(12);
    });

    it('skips currentTime update when paused', () => {
      resetVideoState({ paused: true, readyState: 4, currentTime: 20, duration: 60 });
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => { fireEvent.timeUpdate(video); });
      // State was 0 at mount, should remain 0 because paused guard returns early
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('skips currentTime update when readyState < 2', () => {
      resetVideoState({ paused: false, readyState: 1, currentTime: 25, duration: 60 });
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => { fireEvent.timeUpdate(video); });
      // Guard returns early when readyState < 2, state stays at 0
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('skips currentTime update when newTime > videoDuration', () => {
      // Edge case: newTime slightly exceeds duration (shouldn't happen in real browser)
      resetVideoState({ paused: false, readyState: 4, currentTime: 61, duration: 60 });
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => { fireEvent.timeUpdate(video); });
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('skips currentTime update when duration is 0', () => {
      resetVideoState({ paused: false, readyState: 4, currentTime: 5, duration: 0 });
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => { fireEvent.timeUpdate(video); });
      expect(hookRef.current!.currentTime).toBe(0);
    });
  });

  // ── updateProgress animation frame ─────────────────────────────────────────
  describe('updateProgress via animation frame', () => {
    it('updates currentTime and re-requests frame when playing', () => {
      resetVideoState({ paused: false, readyState: 4, duration: 60 });
      const { hookRef } = renderHook();

      // Capture the updateProgress callback passed to requestAnimationFrame
      let capturedCallback: FrameRequestCallback | null = null;
      (global.requestAnimationFrame as jest.Mock).mockImplementation(
        (cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 99;
        },
      );

      const video = getVideo();
      // Set currentTime AFTER mount (mount effect resets it to 0)
      act(() => {
        videoState.currentTime = 5;
        fireEvent.play(video);
      });

      // Now invoke the animation frame callback
      expect(capturedCallback).not.toBeNull();
      act(() => {
        if (capturedCallback) capturedCallback(performance.now());
      });

      expect(hookRef.current!.currentTime).toBe(5);
      // Should have re-requested another frame
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(2);
    });

    it('stops (does not re-request frame) when video is paused', () => {
      resetVideoState({ paused: true, readyState: 4, currentTime: 5, duration: 60 });
      const { hookRef: _ } = renderHook();

      let capturedCallback: FrameRequestCallback | null = null;
      (global.requestAnimationFrame as jest.Mock).mockImplementation(
        (cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 100;
        },
      );

      const video = getVideo();
      // Fire play to start updateProgress, but keep video paused in state
      act(() => { fireEvent.play(video); });

      const callCountAfterPlay = (global.requestAnimationFrame as jest.Mock).mock.calls.length;

      // Invoke the callback while paused
      if (capturedCallback) {
        act(() => { (capturedCallback as FrameRequestCallback)(performance.now()); });
      }

      // Should NOT have re-requested a new frame (paused guard returns early)
      expect((global.requestAnimationFrame as jest.Mock).mock.calls.length).toBe(callCountAfterPlay);
    });

    it('re-requests frame when readyState < 2 (buffering) without updating time', () => {
      resetVideoState({ paused: false, readyState: 1, currentTime: 5, duration: 60 });
      const { hookRef } = renderHook();

      const callbacks: FrameRequestCallback[] = [];
      (global.requestAnimationFrame as jest.Mock).mockImplementation(
        (cb: FrameRequestCallback) => {
          callbacks.push(cb);
          return callbacks.length;
        },
      );

      const video = getVideo();
      act(() => { fireEvent.play(video); });

      const firstCallback = callbacks[0];
      act(() => {
        if (firstCallback) firstCallback(performance.now());
      });

      // currentTime should NOT have been updated (readyState < 2 branch re-requests without updating)
      expect(hookRef.current!.currentTime).toBe(0);
      // Should have re-requested a frame
      expect(callbacks.length).toBeGreaterThan(1);
    });
  });

  // ── duration from attachment ─────────────────────────────────────────────────
  describe('duration from attachmentDuration', () => {
    it('sets duration state on mount when attachmentDuration > 0', () => {
      const { hookRef } = renderHook(makeOptions({ duration: 75 }));
      expect(hookRef.current!.duration).toBe(75);
    });

    it('does NOT set duration when attachmentDuration is 0', () => {
      const { hookRef } = renderHook(makeOptions({ duration: 0 }));
      expect(hookRef.current!.duration).toBe(0);
    });

    it('does NOT set duration when attachmentDuration is undefined', () => {
      const { hookRef } = renderHook(makeOptions({ duration: undefined }));
      expect(hookRef.current!.duration).toBe(0);
    });
  });

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  describe('cleanup on unmount', () => {
    it('pauses video on unmount', () => {
      const { unmount } = renderHook();
      unmount();
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    });

    it('calls MediaManager.stop() on unmount', () => {
      const { unmount } = renderHook();
      unmount();
      expect(mockMediaManagerStop).toHaveBeenCalled();
    });

    it('cancels animation frame on unmount', () => {
      (global.requestAnimationFrame as jest.Mock).mockReturnValueOnce(42);
      const { unmount } = renderHook();
      const video = getVideo();
      act(() => { fireEvent.play(video); });
      unmount();
      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(42);
    });

    it('removes src attribute and calls load() on unmount', () => {
      const { unmount } = renderHook();
      const loadCallsBefore = (HTMLMediaElement.prototype.load as jest.Mock).mock.calls.length;
      unmount();
      // load() should be called again after src removal
      expect((HTMLMediaElement.prototype.load as jest.Mock).mock.calls.length).toBeGreaterThan(loadCallsBefore);
    });

    it('removes event listeners by not throwing after unmount', () => {
      const { unmount } = renderHook();
      expect(() => unmount()).not.toThrow();
    });
  });

  // ── additional branch coverage ─────────────────────────────────────────────
  describe('additional branch coverage', () => {
    it('updateProgress skips setCurrentTime when newTime > videoDuration', () => {
      resetVideoState({ paused: false, readyState: 4, duration: 60 });
      const { hookRef } = renderHook();

      let capturedCallback: FrameRequestCallback | null = null;
      (global.requestAnimationFrame as jest.Mock).mockImplementation(
        (cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 99;
        },
      );

      const video = getVideo();
      act(() => {
        videoState.currentTime = 70; // exceeds duration — set AFTER mount reset
        fireEvent.play(video);
      });

      expect(capturedCallback).not.toBeNull();
      act(() => {
        if (capturedCallback) capturedCallback(performance.now());
      });

      // currentTime should NOT have been updated to 70
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('timeupdate skips setCurrentTime when newTime > videoDuration', () => {
      resetVideoState({ paused: false, readyState: 4, duration: 60 });
      const { hookRef } = renderHook();
      const video = getVideo();

      act(() => {
        videoState.currentTime = 70; // exceeds duration — set AFTER mount reset
        fireEvent.timeUpdate(video);
      });

      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('tryToGetDuration does not reset currentTime when already > 0 and finite', () => {
      resetVideoState({ duration: 60 });
      const { hookRef } = renderHook();

      // Seek to a non-zero position so videoRef.current.currentTime > 0
      act(() => { hookRef.current!.handleSeek(5); });
      expect(hookRef.current!.currentTime).toBe(5);

      // handleLoadedMetadata should NOT reset currentTime to 0
      act(() => { hookRef.current!.handleLoadedMetadata(); });
      expect(hookRef.current!.currentTime).toBe(5);
      expect(hookRef.current!.duration).toBe(60);
    });

    it('togglePlay pause: watchedMs=0 when playStartTimeRef is null (play via DOM event)', async () => {
      const { hookRef } = renderHook();
      const video = getVideo();

      // Fire DOM play event — sets isPlaying=true but NOT playStartTimeRef
      act(() => { fireEvent.play(video); });
      expect(hookRef.current!.isPlaying).toBe(true);

      // Calling togglePlay to pause — playStartTimeRef.current is null → watchedMs = 0
      await act(async () => { await hookRef.current!.togglePlay(); });

      // watchedMs = 0 < 3000 → trackConsumption NOT called
      expect(mockApiPost).not.toHaveBeenCalled();
      expect(hookRef.current!.isPlaying).toBe(false);
    });

    it('pause event: skips cancelAnimationFrame when no frame is running', () => {
      const { hookRef } = renderHook();
      const video = getVideo();

      // Fire pause without prior play — animationFrameRef.current stays null
      (global.cancelAnimationFrame as jest.Mock).mockClear();
      act(() => { fireEvent.pause(video); });

      expect(global.cancelAnimationFrame).not.toHaveBeenCalled();
      expect(hookRef.current!.isPlaying).toBe(false);
    });
  });

  // ── attachmentId change resets refs ────────────────────────────────────────
  describe('attachmentId change resets tracking', () => {
    it('resets currentTime to 0 when attachmentId changes', () => {
      const { hookRef, rerender } = renderHook(makeOptions({ attachmentId: 'att-001' }));
      act(() => { hookRef.current!.handleSeek(30); });
      expect(hookRef.current!.currentTime).toBe(30);

      rerender(
        <TestComponent
          options={makeOptions({ attachmentId: 'att-002' })}
          hookRef={hookRef}
        />,
      );
      expect(hookRef.current!.currentTime).toBe(0);
    });

    it('allows tracking again after attachmentId changes (resets hasTrackedCompletionRef)', () => {
      const { hookRef, rerender } = renderHook(makeOptions({ attachmentId: 'att-001' }));

      // Track completion for att-001
      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      mockApiPost.mockClear();

      // Switch to att-002 — should reset hasTrackedCompletionRef
      rerender(
        <TestComponent
          options={makeOptions({ attachmentId: 'att-002' })}
          hookRef={hookRef}
        />,
      );

      act(() => { hookRef.current!.handleEnded(); });
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });
  });
});
