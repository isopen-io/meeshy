/**
 * Tests for useActivePeerConnection
 *
 * Regression guard for the dormant quality/adaptive-compression loop:
 * VideoCallInterface previously selected the active RTCPeerConnection with a
 * `useMemo(..., [])` reading `useCallStore.getState()` ONCE at mount — before
 * any peer connection exists — so it stayed `null` for the whole call. That
 * silently disabled call-quality monitoring, the adaptive bitrate ladder and
 * the `call:quality-report` emission. This hook must instead track the store
 * REACTIVELY so the connection surfaces as soon as it is added.
 */

import { renderHook, act } from '@testing-library/react';

// The call store imports the Socket.IO service (→ E2EE → @meeshy/shared
// encryption), which is irrelevant here and drags in unresolvable runtime-only
// modules under jest. Mock it to keep this a focused store-selector test.
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => null,
  },
}));

import { useActivePeerConnection } from '@/hooks/use-active-peer-connection';
import { useCallStore } from '@/stores/call-store';

const makeFakePeerConnection = (): RTCPeerConnection =>
  ({ close: jest.fn() } as unknown as RTCPeerConnection);

afterEach(() => {
  act(() => {
    useCallStore.getState().clearPeerConnections();
  });
});

describe('useActivePeerConnection', () => {
  it('returns null when there are no peer connections', () => {
    const { result } = renderHook(() => useActivePeerConnection());
    expect(result.current).toBeNull();
  });

  it('surfaces a peer connection added AFTER mount (reactive, not snapshotted)', () => {
    const { result } = renderHook(() => useActivePeerConnection());
    expect(result.current).toBeNull();

    const pc = makeFakePeerConnection();
    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc);
    });

    expect(result.current).toBe(pc);
  });

  it('returns null again once the connection is removed', () => {
    const pc = makeFakePeerConnection();
    const { result } = renderHook(() => useActivePeerConnection());

    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc);
    });
    expect(result.current).toBe(pc);

    act(() => {
      useCallStore.getState().removePeerConnection('peer-1');
    });
    expect(result.current).toBeNull();
  });

  it('keeps a stable reference across unrelated store updates (no render churn)', () => {
    const pc = makeFakePeerConnection();
    const { result } = renderHook(() => useActivePeerConnection());

    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc);
    });
    const first = result.current;

    act(() => {
      useCallStore.getState().setConnecting(true);
    });

    expect(result.current).toBe(first);
  });
});
