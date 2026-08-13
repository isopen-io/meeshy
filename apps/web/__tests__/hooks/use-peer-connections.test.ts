/**
 * Tests for usePeerConnections
 *
 * Regression guard for the dormant quality/adaptive-compression loop:
 * VideoCallInterface previously selected the active RTCPeerConnection with a
 * `useMemo(..., [])` reading `useCallStore.getState()` ONCE at mount — before
 * any peer connection exists — so it stayed `null` for the whole call. That
 * silently disabled call-quality monitoring, the adaptive bitrate ladder and
 * the `call:quality-report` emission. This hook must instead track the store
 * REACTIVELY so connections surface as soon as they are added.
 *
 * Supersedes `useActivePeerConnection` (removed): once the group-call
 * participant cap was lifted (S1, `2026-08-13-group-calls-gap-analysis.md`),
 * "the first peer is the only peer" no longer holds — this hook exposes the
 * WHOLE map so callers (`useCallQuality`) can aggregate across every peer.
 */

import { renderHook, act } from '@testing-library/react';

// The call store imports the Socket.IO service (→ E2EE → @meeshy/shared
// encryption), which is irrelevant here and drags in unresolvable runtime-only
// modules under jest. Mock it to keep this a focused store-selector test.
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => null,
    onStatusChange: jest.fn(() => () => {}),
  },
}));

import { usePeerConnections } from '@/hooks/use-peer-connections';
import { useCallStore } from '@/stores/call-store';

const makeFakePeerConnection = (): RTCPeerConnection =>
  ({ close: jest.fn() } as unknown as RTCPeerConnection);

afterEach(() => {
  act(() => {
    useCallStore.getState().clearPeerConnections();
  });
});

describe('usePeerConnections', () => {
  it('returns an empty map when there are no peer connections', () => {
    const { result } = renderHook(() => usePeerConnections());
    expect(result.current.size).toBe(0);
  });

  it('surfaces a peer connection added AFTER mount (reactive, not snapshotted)', () => {
    const { result } = renderHook(() => usePeerConnections());
    expect(result.current.size).toBe(0);

    const pc = makeFakePeerConnection();
    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc);
    });

    expect(result.current.get('peer-1')).toBe(pc);
    expect(result.current.size).toBe(1);
  });

  it('surfaces every peer in a group call, not just the first', () => {
    const { result } = renderHook(() => usePeerConnections());

    const pc1 = makeFakePeerConnection();
    const pc2 = makeFakePeerConnection();
    const pc3 = makeFakePeerConnection();
    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc1);
      useCallStore.getState().addPeerConnection('peer-2', pc2);
      useCallStore.getState().addPeerConnection('peer-3', pc3);
    });

    expect(result.current.size).toBe(3);
    expect(result.current.get('peer-1')).toBe(pc1);
    expect(result.current.get('peer-2')).toBe(pc2);
    expect(result.current.get('peer-3')).toBe(pc3);
  });

  it('drops only the removed peer, keeping the others', () => {
    const { result } = renderHook(() => usePeerConnections());

    const pc1 = makeFakePeerConnection();
    const pc2 = makeFakePeerConnection();
    act(() => {
      useCallStore.getState().addPeerConnection('peer-1', pc1);
      useCallStore.getState().addPeerConnection('peer-2', pc2);
    });

    act(() => {
      useCallStore.getState().removePeerConnection('peer-1');
    });

    expect(result.current.has('peer-1')).toBe(false);
    expect(result.current.get('peer-2')).toBe(pc2);
    expect(result.current.size).toBe(1);
  });

  it('keeps a stable reference across unrelated store updates (no render churn)', () => {
    const pc = makeFakePeerConnection();
    const { result } = renderHook(() => usePeerConnections());

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
