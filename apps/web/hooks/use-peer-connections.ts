/**
 * USE PEER CONNECTIONS
 *
 * Reactively tracks EVERY RTCPeerConnection of the current call, keyed by
 * participant id.
 *
 * Why a dedicated hook: connections are created lazily (inside
 * createOffer/handleOffer), well after the call UI mounts, and — since the
 * group-call cap was lifted (S1, `2026-08-13-group-calls-gap-analysis.md`) —
 * there can be MORE THAN ONE at a time. Reading
 * `useCallStore.getState().peerConnections` once in a `useMemo(..., [])`
 * captures an empty map and never updates. Selecting from the store makes the
 * component re-render the instant a connection is added or removed, which is
 * what keeps call-quality monitoring, the adaptive bitrate ladder and
 * `call:quality-report` alive for the whole call (see
 * `use-call-quality.ts`'s peer-stats aggregation).
 *
 * The store writes a NEW `Map` on every add/remove (never mutates the
 * existing one — see `call-store.ts`), so selecting the map itself gives a
 * reference that is stable across unrelated store updates (Zustand's
 * `Object.is` equality) and only changes when the peer set actually changes.
 *
 * Supersedes `useActivePeerConnection`, which assumed the 1:1-only invariant
 * "there is at most one peer" — no longer true once a call can host a group.
 */

'use client';

import { useCallStore } from '@/stores/call-store';

export function usePeerConnections(): ReadonlyMap<string, RTCPeerConnection> {
  return useCallStore((state) => state.peerConnections);
}
