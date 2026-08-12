/**
 * Tests for useCallBanner hook
 *
 * Vague 112 (2026-08-12) — `hasActiveCall` used to require `isInCall: true`,
 * i.e. the viewer being the one who ALREADY joined the call. Every write site
 * for `currentCall` (`useCallStore`) sets `isInCall` true in the same breath,
 * so `currentCall && !isInCall` was unreachable — the banner could never show
 * for the group member it exists to help (someone who hasn't joined yet).
 * The hook now sources "is a call live in this conversation" from
 * `GET /conversations/:id/active-call` (the same REST check the live-bubble
 * join path already revalidates against), independent of the viewer's own
 * `isInCall` flag — and only shows while `!isInCall`, since once the viewer
 * has joined the full-screen call UI already covers this.
 *
 * Covers:
 * - No active call (REST returns null): showCallBanner=false, callDuration=0
 * - Active call for this conversation, viewer NOT in it: showCallBanner=true
 * - Active call but the viewer already joined it (isInCall=true): showCallBanner=false
 * - Active call for a different conversationId: showCallBanner=false
 * - Call status='ended': showCallBanner=false
 * - callDuration anchors on answeredAt, falls back to startedAt
 * - handleJoinCall: poses a requestJoin (live-bubble join path), never starts a new call
 * - handleJoinCall: derives callType from metadata.type, NOT participants[].isVideoEnabled
 *   (Vague 115 — the latter is always stripped by the REST whitelist, so every banner join
 *   silently forced audio-only regardless of the call's real nature)
 * - handleDismissCallBanner: hides the banner for that call id only
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCallBanner } from '@/components/conversations/header/use-call-banner';
import { useCallStore } from '@/stores/call-store';
import type { CallSession, CallParticipant } from '@meeshy/shared/types/video-call';

const mockGetActiveCall = jest.fn();

jest.mock('@/services/calls.service', () => ({
  callsService: {
    getActiveCall: (...args: unknown[]) => mockGetActiveCall(...args),
  },
}));

// Use the real zustand store so requestJoin's own isInCall guard is exercised
// too — only its identity is swapped per-test so calls can be asserted.
jest.mock('@/stores/call-store', () => {
  const actual = jest.requireActual('@/stores/call-store');
  return actual;
});

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<CallParticipant> = {}): CallParticipant {
  return {
    id: 'p-1',
    callSessionId: 'call-123',
    userId: 'user-2',
    role: 'participant',
    joinedAt: new Date(),
    isAudioEnabled: true,
    isVideoEnabled: false,
    ...overrides,
  };
}

function makeCallSession(overrides: Partial<CallSession> = {}): CallSession {
  return {
    id: 'call-123',
    conversationId: 'conv-123',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [makeParticipant()],
    ...overrides,
  } as CallSession;
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function renderBanner(conversationId = 'conv-123') {
  const qc = makeQC();
  return renderHook(() => useCallBanner(conversationId), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useCallBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useCallStore.setState({ isInCall: false, joinRequest: null });
    });
  });

  describe('when there is no active call', () => {
    it('returns showCallBanner=false', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: null });

      const { result } = renderBanner();

      await waitFor(() => expect(result.current.currentCall).toBeNull());
      expect(result.current.showCallBanner).toBe(false);
      expect(result.current.callDuration).toBe(0);
    });
  });

  describe('when a call is active for this conversation and the viewer has NOT joined it', () => {
    it('returns showCallBanner=true and the call', async () => {
      const call = makeCallSession();
      mockGetActiveCall.mockResolvedValue({ success: true, data: call });

      const { result } = renderBanner();

      await waitFor(() => expect(result.current.showCallBanner).toBe(true));
      expect(result.current.currentCall).toEqual(call);
    });

    it('fetches via GET /conversations/:id/active-call, not the call store', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: makeCallSession() });

      renderBanner('conv-123');

      await waitFor(() => expect(mockGetActiveCall).toHaveBeenCalledWith('conv-123'));
    });
  });

  describe('when the viewer has already joined the active call', () => {
    it('returns showCallBanner=false — the full-screen call UI already covers this', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: makeCallSession() });
      act(() => {
        useCallStore.setState({ isInCall: true });
      });

      const { result } = renderBanner();

      await waitFor(() => expect(mockGetActiveCall).toHaveBeenCalled());
      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('when the active call belongs to a different conversation', () => {
    it('returns showCallBanner=false', async () => {
      mockGetActiveCall.mockResolvedValue({
        success: true,
        data: makeCallSession({ conversationId: 'conv-DIFFERENT' }),
      });

      const { result } = renderBanner('conv-123');

      await waitFor(() => expect(mockGetActiveCall).toHaveBeenCalled());
      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('when the call status is terminal', () => {
    it.each(['ended', 'missed', 'rejected', 'failed'] as const)('returns showCallBanner=false for status=%s', async (status) => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: makeCallSession({ status }) });

      const { result } = renderBanner();

      await waitFor(() => expect(mockGetActiveCall).toHaveBeenCalled());
      expect(result.current.showCallBanner).toBe(false);
    });
  });

  describe('callDuration', () => {
    it('anchors on answeredAt when present, not startedAt (ring time excluded)', async () => {
      const startedAt = new Date(Date.now() - 30_000); // rang 30s ago
      const answeredAt = new Date(Date.now() - 5_000); // answered 5s ago
      mockGetActiveCall.mockResolvedValue({
        success: true,
        data: makeCallSession({ startedAt, answeredAt }),
      });

      const { result } = renderBanner();

      await waitFor(() => expect(result.current.callDuration).toBeGreaterThanOrEqual(5));
      expect(result.current.callDuration).toBeLessThan(30);
    });

    it('falls back to startedAt when the call has not been answered yet', async () => {
      const startedAt = new Date(Date.now() - 12_000);
      mockGetActiveCall.mockResolvedValue({
        success: true,
        data: makeCallSession({ startedAt, answeredAt: undefined }),
      });

      const { result } = renderBanner();

      await waitFor(() => expect(result.current.callDuration).toBeGreaterThanOrEqual(12));
    });

    it('stays 0 while the banner is hidden', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: null });

      const { result } = renderBanner();

      await waitFor(() => expect(result.current.currentCall).toBeNull());
      expect(result.current.callDuration).toBe(0);
    });
  });

  describe('handleJoinCall', () => {
    it('poses a requestJoin with callType="video" when metadata.type is video', async () => {
      const call = makeCallSession({
        id: 'call-456',
        metadata: { type: 'video' },
      });
      mockGetActiveCall.mockResolvedValue({ success: true, data: call });

      const { result } = renderBanner('conv-123');
      await waitFor(() => expect(result.current.showCallBanner).toBe(true));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(useCallStore.getState().joinRequest).toEqual({
        callId: 'call-456',
        conversationId: 'conv-123',
        callType: 'video',
      });
    });

    it('poses callType="audio" when metadata.type is audio', async () => {
      const call = makeCallSession({ metadata: { type: 'audio' } });
      mockGetActiveCall.mockResolvedValue({ success: true, data: call });

      const { result } = renderBanner();
      await waitFor(() => expect(result.current.showCallBanner).toBe(true));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(useCallStore.getState().joinRequest?.callType).toBe('audio');
    });

    it('poses callType="audio" when metadata is absent (legacy/pre-Vague-115 session)', async () => {
      const call = makeCallSession({ metadata: undefined });
      mockGetActiveCall.mockResolvedValue({ success: true, data: call });

      const { result } = renderBanner();
      await waitFor(() => expect(result.current.showCallBanner).toBe(true));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(useCallStore.getState().joinRequest?.callType).toBe('audio');
    });

    it('Vague 115 regression: derives callType from metadata.type, NOT participants[].isVideoEnabled — the REST whitelist never carries the latter, so a video call must still join as video even though every participant appears video-off on the wire', async () => {
      const call = makeCallSession({
        id: 'call-789',
        metadata: { type: 'video' },
        participants: [makeParticipant({ isVideoEnabled: false })],
      });
      mockGetActiveCall.mockResolvedValue({ success: true, data: call });

      const { result } = renderBanner('conv-123');
      await waitFor(() => expect(result.current.showCallBanner).toBe(true));

      act(() => {
        result.current.handleJoinCall();
      });

      expect(useCallStore.getState().joinRequest?.callType).toBe('video');
    });

    it('never starts a brand new call — no onStartCall escape hatch exists on this hook', async () => {
      // Regression guard: the hook used to accept an onStartCall callback and
      // call IT on "join", which starts a NEW call instead of joining the
      // live one. Its signature is now conversationId-only.
      expect(useCallBanner.length).toBe(1);
    });

    it('does nothing when there is no active call', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: null });

      const { result } = renderBanner();
      await waitFor(() => expect(result.current.currentCall).toBeNull());

      act(() => {
        result.current.handleJoinCall();
      });

      expect(useCallStore.getState().joinRequest).toBeNull();
    });
  });

  describe('handleDismissCallBanner', () => {
    it('hides the banner for that call id', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: makeCallSession({ id: 'call-789' }) });

      const { result } = renderBanner();
      await waitFor(() => expect(result.current.showCallBanner).toBe(true));

      act(() => {
        result.current.handleDismissCallBanner();
      });

      expect(result.current.showCallBanner).toBe(false);
    });

    it('does not throw when there is nothing to dismiss', async () => {
      mockGetActiveCall.mockResolvedValue({ success: true, data: null });
      const { result } = renderBanner();
      await waitFor(() => expect(result.current.currentCall).toBeNull());

      expect(() => {
        act(() => {
          result.current.handleDismissCallBanner();
        });
      }).not.toThrow();
    });
  });
});
