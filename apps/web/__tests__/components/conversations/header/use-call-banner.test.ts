/**
 * Tests for useCallBanner hook
 *
 * Covers:
 * - No active call: showCallBanner=false, callDuration=0
 * - Active call for same conversationId (not ended): showCallBanner=true, callDuration ticks
 * - Active call for different conversationId: showCallBanner=false
 * - Call status='ended': showCallBanner=false
 * - handleJoinCall: calls onStartCall when currentCall exists
 * - handleDismissCallBanner: sets showCallBanner=false
 */

import { renderHook, act } from '@testing-library/react';
import { useCallBanner } from '@/components/conversations/header/use-call-banner';
import { useCallStore } from '@/stores/call-store';
import type { CallSession } from '@meeshy/shared/types/video-call';

// Use the real zustand store so we can set state via useCallStore.setState
jest.mock('@/stores/call-store', () => {
  const actual = jest.requireActual('@/stores/call-store');
  return actual;
});

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeCallSession(overrides: Partial<CallSession> = {}): CallSession {
  return {
    id: 'call-123',
    conversationId: 'conv-123',
    type: 'video',
    status: 'active',
    participants: [],
    initiatorId: 'user-1',
    startedAt: new Date(),
    ...overrides,
  } as CallSession;
}

function setStoreState(partial: { currentCall: CallSession | null; isInCall: boolean }) {
  act(() => {
    useCallStore.setState({
      currentCall: partial.currentCall,
      isInCall: partial.isInCall,
    });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useCallBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Reset call store to clean state
    act(() => {
      useCallStore.setState({
        currentCall: null,
        isInCall: false,
      });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when there is no active call', () => {
    it('returns showCallBanner=false', () => {
      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(false);
    });

    it('returns callDuration=0', () => {
      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.callDuration).toBe(0);
    });

    it('returns currentCall=null', () => {
      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.currentCall).toBeNull();
    });
  });

  describe('when there is an active call for the same conversationId', () => {
    it('returns showCallBanner=true', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(true);
    });

    it('returns the currentCall object', () => {
      const call = makeCallSession({ conversationId: 'conv-123', status: 'active' });
      setStoreState({ currentCall: call, isInCall: true });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.currentCall).toEqual(call);
    });

    it('computes callDuration based on startedAt', () => {
      // Use a startedAt 30 seconds in the past
      const startedAt = new Date(Date.now() - 30_000);
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active', startedAt }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      // Should be approximately 30
      expect(result.current.callDuration).toBeGreaterThanOrEqual(30);
    });

    it('increments callDuration every second', () => {
      const startedAt = new Date();
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active', startedAt }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      const initialDuration = result.current.callDuration;

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.callDuration).toBeGreaterThanOrEqual(initialDuration + 3);
    });

    it('clears the interval when component unmounts', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const startedAt = new Date();
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active', startedAt }),
        isInCall: true,
      });

      const { unmount } = renderHook(() => useCallBanner('conv-123'));
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('when there is an active call for a DIFFERENT conversationId', () => {
    it('returns showCallBanner=false', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-DIFFERENT', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(false);
    });

    it('returns callDuration=0', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-DIFFERENT', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.callDuration).toBe(0);
    });
  });

  describe('when call status is ended', () => {
    it('returns showCallBanner=false', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'ended' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('when isInCall is false (call exists but not joined)', () => {
    it('returns showCallBanner=false', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: false,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('handleJoinCall', () => {
    it('calls onStartCall when currentCall exists and handler is provided', () => {
      const onStartCall = jest.fn();
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123', onStartCall));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(onStartCall).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no onStartCall handler provided', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(() => {
        act(() => {
          result.current.handleJoinCall();
        });
      }).not.toThrow();
    });

    it('does not call onStartCall when currentCall is null', () => {
      const onStartCall = jest.fn();
      setStoreState({ currentCall: null, isInCall: false });

      const { result } = renderHook(() => useCallBanner('conv-123', onStartCall));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(onStartCall).not.toHaveBeenCalled();
    });
  });

  describe('handleDismissCallBanner', () => {
    it('sets showCallBanner=false when called', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(true);

      act(() => {
        result.current.handleDismissCallBanner();
      });

      expect(result.current.showCallBanner).toBe(false);
    });

    it('keeps showCallBanner=false if it was already false', () => {
      const { result } = renderHook(() => useCallBanner('conv-123'));

      act(() => {
        result.current.handleDismissCallBanner();
      });

      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('when call has no startedAt timestamp', () => {
    it('callDuration stays 0 when startedAt is not set', () => {
      setStoreState({
        currentCall: makeCallSession({
          conversationId: 'conv-123',
          status: 'active',
          startedAt: undefined,
        }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.callDuration).toBe(0);
    });
  });

  describe('call becomes active after mount', () => {
    it('sets showCallBanner=true when call is set after mount', () => {
      const { result } = renderHook(() => useCallBanner('conv-123'));

      expect(result.current.showCallBanner).toBe(false);

      act(() => {
        useCallStore.setState({
          currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
          isInCall: true,
        });
      });

      expect(result.current.showCallBanner).toBe(true);
    });
  });

  describe('call ends after being active', () => {
    it('sets showCallBanner=false when call status changes to ended', () => {
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active' }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));
      expect(result.current.showCallBanner).toBe(true);

      act(() => {
        useCallStore.setState({
          currentCall: makeCallSession({ conversationId: 'conv-123', status: 'ended' }),
        });
      });

      expect(result.current.showCallBanner).toBe(false);
    });

    it('resets callDuration to 0 when call ends', () => {
      const startedAt = new Date();
      setStoreState({
        currentCall: makeCallSession({ conversationId: 'conv-123', status: 'active', startedAt }),
        isInCall: true,
      });

      const { result } = renderHook(() => useCallBanner('conv-123'));

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.callDuration).toBeGreaterThan(0);

      act(() => {
        useCallStore.setState({
          currentCall: null,
          isInCall: false,
        });
      });

      expect(result.current.callDuration).toBe(0);
    });
  });
});
