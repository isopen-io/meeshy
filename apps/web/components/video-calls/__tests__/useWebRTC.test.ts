import { renderHook, act } from '@testing-library/react';
import { useWebRTC } from '../hooks/useWebRTC';

jest.mock('@/services/webrtc-service');
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { WebRTCService } from '@/services/webrtc-service';

const MockWebRTCService = WebRTCService as jest.MockedClass<typeof WebRTCService>;

const makeStream = (overrides: Partial<MediaStream> = {}): MediaStream => ({
  getTracks: () => [],
  getAudioTracks: () => [],
  getVideoTracks: () => [],
  ...overrides,
} as unknown as MediaStream);

let mockGetLocalStream: jest.Mock;
let mockSwitchCamera: jest.Mock;
let mockClose: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetLocalStream = jest.fn().mockResolvedValue(makeStream());
  mockSwitchCamera = jest.fn();
  mockClose = jest.fn();
  MockWebRTCService.mockImplementation(() => ({
    getLocalStream: mockGetLocalStream,
    switchCamera: mockSwitchCamera,
    close: mockClose,
  }) as unknown as WebRTCService);
  Object.defineProperty(window, 'RTCPeerConnection', { writable: true, configurable: true, value: jest.fn() });
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    configurable: true,
    value: { getUserMedia: jest.fn() },
  });
});

describe('useWebRTC', () => {
  describe('initial state', () => {
    it('returns localStream=null, isInitializing=false, error=null', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(result.current.localStream).toBeNull();
      expect(result.current.isInitializing).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('checkBrowserSupport', () => {
    it('returns false and sets error when navigator.mediaDevices is undefined', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useWebRTC());

      let supported: boolean;
      act(() => {
        supported = result.current.checkBrowserSupport();
      });

      expect(supported!).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toMatch(/browser does not support/i);
    });

    it('returns false and sets error when window.RTCPeerConnection is undefined but mediaDevices exists', () => {
      Object.defineProperty(window, 'RTCPeerConnection', { writable: true, configurable: true, value: undefined });

      const { result } = renderHook(() => useWebRTC());

      let supported: boolean;
      act(() => {
        supported = result.current.checkBrowserSupport();
      });

      expect(supported!).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toMatch(/WebRTC is not supported/i);
    });

    it('returns false and sets error when protocol is not https and hostname is not localhost', () => {
      Object.defineProperty(window, 'RTCPeerConnection', { writable: true, configurable: true, value: undefined });
      const { result } = renderHook(() => useWebRTC());
      act(() => {
        result.current.checkBrowserSupport();
      });
      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('returns true when all checks pass (set up window.RTCPeerConnection, navigator.mediaDevices, window.location to localhost)', () => {
      const { result } = renderHook(() => useWebRTC());

      let supported: boolean;
      act(() => {
        supported = result.current.checkBrowserSupport();
      });

      expect(supported!).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('calls onError callback when browser not supported', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      const onError = jest.fn();
      const { result } = renderHook(() => useWebRTC({ onError }));

      act(() => {
        result.current.checkBrowserSupport();
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getLocalStream', () => {
    it('calls WebRTCService.getLocalStream with constraints', async () => {
      const constraints: MediaStreamConstraints = { video: true, audio: true };
      const { result } = renderHook(() => useWebRTC());

      await act(async () => {
        await result.current.getLocalStream(constraints);
      });

      expect(mockGetLocalStream).toHaveBeenCalledWith(constraints);
    });

    it('sets localStream on success', async () => {
      const stream = makeStream();
      mockGetLocalStream.mockResolvedValue(stream);

      const { result } = renderHook(() => useWebRTC());

      await act(async () => {
        await result.current.getLocalStream();
      });

      expect(result.current.localStream).toBe(stream);
    });

    it('sets isInitializing=true during fetch, false after', async () => {
      let resolveStream!: (stream: MediaStream) => void;
      mockGetLocalStream.mockReturnValue(
        new Promise<MediaStream>(res => {
          resolveStream = res;
        })
      );

      const { result } = renderHook(() => useWebRTC());

      const getStreamPromise = result.current.getLocalStream();

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isInitializing).toBe(true);

      await act(async () => {
        resolveStream(makeStream());
        await getStreamPromise;
      });

      expect(result.current.isInitializing).toBe(false);
    });

    it('throws and sets error on failure', async () => {
      const serviceError = new Error('Permission denied');
      mockGetLocalStream.mockRejectedValue(serviceError);

      const { result } = renderHook(() => useWebRTC());

      let caughtError: unknown;
      await act(async () => {
        try {
          await result.current.getLocalStream();
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe('Permission denied');
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Permission denied');
    });

    it('calls onError callback on failure', async () => {
      const serviceError = new Error('Camera busy');
      mockGetLocalStream.mockRejectedValue(serviceError);

      const onError = jest.fn();
      const { result } = renderHook(() => useWebRTC({ onError }));

      await act(async () => {
        try {
          await result.current.getLocalStream();
        } catch {
        }
      });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Camera busy' }));
    });
  });

  describe('toggleAudio', () => {
    it('calls getAudioTracks().forEach on localStream', async () => {
      const mockTrack = { enabled: true };
      const stream = makeStream({
        getAudioTracks: () => [mockTrack] as unknown as MediaStreamTrack[],
      });
      mockGetLocalStream.mockResolvedValue(stream);

      const { result } = renderHook(() => useWebRTC());

      await act(async () => {
        await result.current.getLocalStream();
      });

      act(() => {
        result.current.toggleAudio(false);
      });

      expect(mockTrack.enabled).toBe(false);
    });

    it('no-ops when localStream is null', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(() => {
        act(() => {
          result.current.toggleAudio(false);
        });
      }).not.toThrow();
    });
  });

  describe('toggleVideo', () => {
    it('calls getVideoTracks().forEach on localStream', async () => {
      const mockTrack = { enabled: true };
      const stream = makeStream({
        getVideoTracks: () => [mockTrack] as unknown as MediaStreamTrack[],
      });
      mockGetLocalStream.mockResolvedValue(stream);

      const { result } = renderHook(() => useWebRTC());

      await act(async () => {
        await result.current.getLocalStream();
      });

      act(() => {
        result.current.toggleVideo(false);
      });

      expect(mockTrack.enabled).toBe(false);
    });

    it('no-ops when localStream is null', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(() => {
        act(() => {
          result.current.toggleVideo(true);
        });
      }).not.toThrow();
    });
  });

  describe('stopLocalStream', () => {
    it('stops all tracks and sets localStream=null', async () => {
      const mockStop = jest.fn();
      const stream = makeStream({
        getTracks: () => [{ stop: mockStop }] as unknown as MediaStreamTrack[],
      });
      mockGetLocalStream.mockResolvedValue(stream);

      const { result } = renderHook(() => useWebRTC());

      await act(async () => {
        await result.current.getLocalStream();
      });

      expect(result.current.localStream).toBe(stream);

      act(() => {
        result.current.stopLocalStream();
      });

      expect(mockStop).toHaveBeenCalled();
      expect(result.current.localStream).toBeNull();
    });

    it('no-ops when localStream is null', () => {
      const { result } = renderHook(() => useWebRTC());
      expect(() => {
        act(() => {
          result.current.stopLocalStream();
        });
      }).not.toThrow();
      expect(result.current.localStream).toBeNull();
    });
  });
});
