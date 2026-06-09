/**
 * USE ACTIVE PEER CONNECTION
 *
 * Reactively tracks the primary RTCPeerConnection of the current P2P call.
 *
 * Why a dedicated hook: the connection is created lazily (inside
 * createOffer/handleOffer), well after the call UI mounts. Reading
 * `useCallStore.getState().peerConnections` once in a `useMemo(..., [])`
 * captured an empty map and never updated — leaving call-quality monitoring,
 * the adaptive bitrate ladder and `call:quality-report` permanently dormant
 * (the encoder never backed off under congestion → "instabilité de connexion"
 * after a few minutes on constrained links). Selecting from the store makes the
 * component re-render the instant a connection is added so the whole
 * quality/compression feedback loop comes alive.
 *
 * P2P invariant: there is at most one peer in a 1:1 call, so the first
 * connection is the active one. The selector returns the SAME instance across
 * unrelated store updates (Zustand's Object.is equality), so it does not cause
 * render churn.
 */

'use client';

import { useCallStore } from '@/stores/call-store';

export function useActivePeerConnection(): RTCPeerConnection | null {
  return useCallStore((state) =>
    state.peerConnections.size > 0
      ? state.peerConnections.values().next().value ?? null
      : null
  );
}
