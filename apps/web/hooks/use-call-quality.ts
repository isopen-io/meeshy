/**
 * USE CALL QUALITY HOOK
 * Monitors WebRTC connection quality in real-time
 *
 * Provides:
 * - Connection quality level (excellent/good/fair/poor)
 * - Detailed statistics (packet loss, RTT, bitrate, jitter)
 * - Automatic quality level calculation
 * - Real-time updates
 *
 * Group-call aggregation (W5, `2026-08-13-group-calls-gap-analysis.md`): this
 * hook samples EVERY peer connection passed in, not just one. A 1:1 call has
 * a single peer so aggregation is a no-op there, but once a call hosts 3+
 * participants a single struggling peer must not be silently masked by
 * healthy ones (nor a struggling peer's stats wrongly drive the WHOLE call's
 * adaptive-degradation ladder while everyone else is fine — see
 * `useAdaptiveDegradation`, whose `applyTier`/`suspend` already act on every
 * peer via `useWebRTCP2P.applyQualityTier`). RTT/packet-loss/jitter take the
 * WORST value across peers (a lagging peer must move the needle); bitrate and
 * cumulative byte counters SUM across peers (total bandwidth in use). The
 * external shape (`ConnectionQualityStats`) is unchanged, so every downstream
 * consumer (`CallQualityOverlay`, `useAdaptiveDegradation`,
 * `useCallAnalyticsReporter`) needed no changes.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  ConnectionQualityLevel,
  ConnectionQualityStats,
} from '@meeshy/shared/types/video-call';

export interface UseCallQualityOptions {
  peerConnections: ReadonlyMap<string, RTCPeerConnection>;
  callId?: string | null;
  updateInterval?: number; // milliseconds
}

/**
 * Calculate quality level based on stats
 *
 * RTT boundaries are round-trip and calibrated for MOBILE / long-haul links,
 * not domestic wired: a 4G/5G baseline runs 150-300ms and an intercontinental
 * hop 250-350ms with zero congestion. Packet loss — the real congestion
 * signal — keeps its tighter bands. Mirrors the iOS ladder in
 * VideoQualityLevel.from (WebRTCTypes.swift): good < 300, fair < 450.
 */
function calculateQualityLevel(packetLoss: number, rtt: number): ConnectionQualityLevel {
  // Excellent: < 1% packet loss, < 100ms RTT
  if (packetLoss < 1 && rtt < 100) {
    return 'excellent';
  }

  // Good: 1-3% packet loss, up to 300ms RTT (mobile/international baseline)
  if (packetLoss < 3 && rtt < 300) {
    return 'good';
  }

  // Fair: 3-5% packet loss, up to 450ms RTT (distant but usable)
  if (packetLoss < 5 && rtt < 450) {
    return 'fair';
  }

  // Poor: >= 5% packet loss or >= 450ms RTT
  return 'poor';
}

/**
 * Per-peer sample derived from one `getStats()` call — the same fields the
 * single-peer version of this hook used to compute directly, now scoped per
 * participant so a delta rate is never mixed across two different peers.
 */
interface PeerInstantSample {
  rtt: number;
  jitter: number;
  audioBytesReceived: number;
  videoBytesReceived: number;
  sampleTimestamp: number;
  totalPacketsLost: number;
  totalPacketsReceived: number;
  bytesSent: number;
  bytesReceived: number;
}

interface PeerPreviousInbound {
  audioBytes: number;
  videoBytes: number;
  packetsLost: number;
  packetsReceived: number;
  timestamp: number;
}

/** One peer's contribution to the aggregated `ConnectionQualityStats`. */
interface PeerRateSample {
  rtt: number;
  jitter: number;
  packetLoss: number; // per-interval rate, percent
  audioBitrate: number; // kbps, per-interval rate
  videoBitrate: number; // kbps, per-interval rate
  bytesSent: number; // cumulative
  bytesReceived: number; // cumulative
}

async function samplePeerConnection(peerConnection: RTCPeerConnection): Promise<PeerInstantSample> {
  const stats = await peerConnection.getStats();

  let rtt = 0;
  let jitter = 0;
  let audioBytesReceived = 0;
  let videoBytesReceived = 0;
  let sampleTimestamp = 0;
  let totalPacketsLost = 0;
  let totalPacketsReceived = 0;
  let bytesSent = 0;
  let bytesReceived = 0;

  stats.forEach((report) => {
    if (report.type === 'inbound-rtp') {
      // Accumulate packet loss across every inbound stream
      totalPacketsLost += report.packetsLost || 0;
      totalPacketsReceived += report.packetsReceived || 0;

      // Worst-case jitter across every inbound stream — aggregated like the
      // packet-loss counters above so a jittery stream is never masked by a
      // calmer one iterated after it (iteration order is spec-undefined).
      if (report.jitter !== undefined) {
        jitter = Math.max(jitter, report.jitter * 1000); // ms
      }

      if (typeof report.timestamp === 'number') {
        sampleTimestamp = report.timestamp;
      }

      bytesReceived += report.bytesReceived || 0;

      // Accumulate cumulative bytes per kind; the bitrate rate is derived
      // from their delta after the loop.
      if (report.kind === 'audio') {
        audioBytesReceived += report.bytesReceived || 0;
      } else if (report.kind === 'video') {
        videoBytesReceived += report.bytesReceived || 0;
      }
    }

    if (report.type === 'outbound-rtp') {
      bytesSent += report.bytesSent || 0;
    }

    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      // Get RTT (Round-Trip Time)
      if (report.currentRoundTripTime !== undefined) {
        rtt = report.currentRoundTripTime * 1000; // Convert to ms
      }
    }

    if (report.type === 'remote-inbound-rtp') {
      // Alternative source for RTT
      if (report.roundTripTime !== undefined) {
        rtt = report.roundTripTime * 1000; // Convert to ms
      }
    }
  });

  return {
    rtt,
    jitter,
    audioBytesReceived,
    videoBytesReceived,
    sampleTimestamp,
    totalPacketsLost,
    totalPacketsReceived,
    bytesSent,
    bytesReceived,
  };
}

/**
 * Reduce a peer's instant sample against its OWN previous sample into a rate
 * (packet loss %, bitrate kbps) — mirrors the delta-vs-cumulative reasoning
 * that used to live inline in `updateStats`. Packet loss and bitrate are
 * per-INTERVAL rates: the delta of the monotonic counters since the peer's
 * own previous sample, NOT the ratio/value of the ever-growing cumulative
 * counters (which only dilutes over a long call). The first sample for a
 * peer has no predecessor, so its rate is 0; a counter reset (renegotiation)
 * yields a negative delta, clamped to 0.
 */
function reducePeerRate(
  current: PeerInstantSample,
  previous: PeerPreviousInbound | undefined
): PeerRateSample {
  const deltaPacketsLost = previous
    ? Math.max(0, current.totalPacketsLost - previous.packetsLost)
    : current.totalPacketsLost;
  const deltaPacketsReceived = previous
    ? Math.max(0, current.totalPacketsReceived - previous.packetsReceived)
    : current.totalPacketsReceived;
  const deltaPackets = deltaPacketsLost + deltaPacketsReceived;
  const packetLoss = deltaPackets > 0 ? (deltaPacketsLost / deltaPackets) * 100 : 0;

  const elapsedMs = previous ? current.sampleTimestamp - previous.timestamp : 0;
  const bitrateKbps = (curr: number, prev: number): number =>
    elapsedMs > 0 ? (Math.max(0, curr - prev) * 8) / elapsedMs : 0;
  const audioBitrate = previous ? bitrateKbps(current.audioBytesReceived, previous.audioBytes) : 0;
  const videoBitrate = previous ? bitrateKbps(current.videoBytesReceived, previous.videoBytes) : 0;

  return {
    rtt: current.rtt,
    jitter: current.jitter,
    packetLoss,
    audioBitrate,
    videoBitrate,
    bytesSent: current.bytesSent,
    bytesReceived: current.bytesReceived,
  };
}

/**
 * Returns a referentially-STABLE view of `peerConnections`: the same Map
 * instance across renders as long as the peer SET is unchanged (same
 * participant ids mapped to the same `RTCPeerConnection` instances),
 * regardless of whether the caller happens to pass a freshly-constructed Map
 * on every render.
 *
 * Why this matters: `updateStats`/the monitoring effect below key off this
 * value's identity to decide when to (re)sample. `usePeerConnections` (the
 * production caller) already returns a store-stable reference that only
 * changes when a peer is actually added/removed, so this is a no-op there.
 * But nothing in this hook's public contract requires that — a caller
 * passing an inline `new Map([...])` (as a naive test double, or a future
 * derived/filtered view) would otherwise get a NEW identity every render.
 * Since `updateStats` calls `setQualityStats`, that would retrigger the
 * effect, refire `updateStats`, and loop: render → new Map → effect rebuild →
 * setState → render → … pinning a CPU core indefinitely. Comparing by VALUE
 * here (not identity) makes the hook safe by construction rather than by
 * caller convention.
 */
function useStablePeerConnections(
  peerConnections: ReadonlyMap<string, RTCPeerConnection>
): ReadonlyMap<string, RTCPeerConnection> {
  const stableRef = useRef(peerConnections);
  const isSameSet =
    stableRef.current.size === peerConnections.size &&
    Array.from(peerConnections.entries()).every(([id, pc]) => stableRef.current.get(id) === pc);
  if (!isSameSet) {
    stableRef.current = peerConnections;
  }
  return stableRef.current;
}

export function useCallQuality({
  peerConnections: peerConnectionsProp,
  callId = null,
  updateInterval = 1000,
}: UseCallQualityOptions) {
  const peerConnections = useStablePeerConnections(peerConnectionsProp);
  const [qualityStats, setQualityStats] = useState<ConnectionQualityStats | null>(null);

  // Previous quality level, tracked outside React state purely so the
  // "level changed" debug log below can compare against it without making
  // `updateStats` depend on `qualityStats?.level` (see that dependency's
  // removal below for why).
  const previousLevelRef = useRef<ConnectionQualityLevel | undefined>(undefined);

  // Previous inbound cumulative byte/packet counters + sample time, PER PEER
  // (keyed by participant id) so a rate is never computed across two
  // different peers' counters, nor across two different calls. Cleared
  // whenever the peer set becomes empty (see the monitoring effect).
  const previousInboundRef = useRef<Map<string, PeerPreviousInbound>>(new Map());

  /**
   * Sample every peer connection and reduce into a single aggregated stats
   * object: worst-case RTT/packet-loss/jitter across peers (a struggling
   * peer must move the needle, never be masked by healthy ones), summed
   * bitrate/byte counters (total bandwidth in use).
   */
  const updateStats = useCallback(async () => {
    /* istanbul ignore next -- stale-closure guard: React clears the interval before peerConnections can become empty while this callback is still live */
    if (peerConnections.size === 0) return;

    try {
      const entries = Array.from(peerConnections.entries());
      const samples = await Promise.all(
        entries.map(([participantId, pc]) => samplePeerConnection(pc).then((s) => [participantId, s] as const))
      );

      const rates = samples.map(([participantId, sample]) =>
        reducePeerRate(sample, previousInboundRef.current.get(participantId))
      );

      // Persist this tick's counters as next tick's "previous", per peer.
      const nextPrevious = new Map<string, PeerPreviousInbound>();
      samples.forEach(([participantId, sample]) => {
        nextPrevious.set(participantId, {
          audioBytes: sample.audioBytesReceived,
          videoBytes: sample.videoBytesReceived,
          packetsLost: sample.totalPacketsLost,
          packetsReceived: sample.totalPacketsReceived,
          timestamp: sample.sampleTimestamp,
        });
      });
      previousInboundRef.current = nextPrevious;

      const rtt = Math.max(...rates.map((r) => r.rtt));
      const jitter = Math.max(...rates.map((r) => r.jitter));
      const packetLoss = Math.max(...rates.map((r) => r.packetLoss));
      const audioBitrate = rates.reduce((sum, r) => sum + r.audioBitrate, 0);
      const videoBitrate = rates.reduce((sum, r) => sum + r.videoBitrate, 0);
      const bytesSent = rates.reduce((sum, r) => sum + r.bytesSent, 0);
      const bytesReceived = rates.reduce((sum, r) => sum + r.bytesReceived, 0);

      // Calculate quality level from the worst RTT/packet-loss pair — one
      // failing peer degrades the reported level for the whole call, exactly
      // as the adaptive-degradation ladder (fed by this level) should react.
      const level = calculateQualityLevel(packetLoss, rtt);

      const newStats: ConnectionQualityStats = {
        level,
        packetLoss: Math.round(packetLoss * 100) / 100, // Round to 2 decimals
        rtt: Math.round(rtt),
        bitrate: {
          audio: Math.round(audioBitrate),
          video: Math.round(videoBitrate),
        },
        jitter: Math.round(jitter * 100) / 100, // Round to 2 decimals
        timestamp: new Date(),
        bytesSent,
        bytesReceived,
      };

      setQualityStats(newStats);

      // Log quality changes. Audit Vague 27 — this used to compare against
      // `qualityStats?.level` directly, which made this a dependency of
      // `updateStats` and gave it a fresh identity on every REAL quality
      // transition. The monitoring effect below depends on `updateStats` and
      // unconditionally fires it once per effect run ("Initial update"), so
      // a level flip tore the interval down and fired an extra out-of-band
      // getStats() call — independent of `updateInterval`, and capable of
      // chaining into a tight loop if that extra call itself yields another
      // different level (exactly the noisy-connection case this monitor
      // exists to catch). Reading/writing a ref instead keeps `updateStats`
      // stable across ticks.
      if (previousLevelRef.current !== level) {
        logger.info('[useCallQuality]', 'Quality level changed', {
          from: previousLevelRef.current,
          to: level,
          stats: newStats,
          peerCount: entries.length,
        });
      }
      previousLevelRef.current = level;
    } catch (error) {
      logger.error('[useCallQuality]', 'Failed to get stats', { error });
    }
  }, [peerConnections]);

  /**
   * Start monitoring when at least one peer connection is available
   */
  useEffect(() => {
    if (peerConnections.size === 0) {
      setQualityStats(null);
      previousInboundRef.current = new Map();
      return;
    }

    logger.debug('[useCallQuality]', 'Starting quality monitoring', {
      updateInterval,
      peerCount: peerConnections.size,
    });

    // Initial update
    updateStats();

    // Set up interval for updates
    const interval = setInterval(updateStats, updateInterval);

    return () => {
      clearInterval(interval);
      // Deliberately does NOT reset previousInboundRef here. This cleanup
      // fires on EVERY `peerConnections` reference change — including a
      // single peer joining or leaving an otherwise-ongoing group call — not
      // just on real call teardown. Wiping the whole per-peer baseline map
      // there would corrupt the delta-rate computation for peers that never
      // left (see the "adding a new peer mid-call" regression test). A
      // genuinely new call always transitions through the `size === 0`
      // branch above first (cleanup() in use-webrtc-p2p clears every peer
      // connection before a new call can add fresh ones), which is where the
      // baseline is actually cleared. A peer that departs simply leaves a
      // stale, unused entry behind — harmless, since only entries for
      // CURRENTLY present participant ids are ever read.
      logger.debug('[useCallQuality]', 'Stopped quality monitoring');
    };
  }, [peerConnections, updateInterval, updateStats]);

  // Keep the latest sample in a ref so the 10s report interval below can read
  // it without being torn down every time a new sample arrives (see effect
  // comment).
  const qualityStatsRef = useRef(qualityStats);
  qualityStatsRef.current = qualityStats;

  // Emit quality report to server every 10 seconds.
  //
  // Deliberately keyed on `callId` ONLY, not `qualityStats`: the monitoring
  // effect above produces a brand-new `qualityStats` object every
  // `updateInterval` tick (as fast as 2s for real callers, see
  // VideoCallInterface). If this effect depended on `qualityStats`, React
  // would tear down and recreate the `setInterval` on every tick — a fresh
  // 10s timer created at T never survives to fire before being cleared at
  // T+2s, so `CALL_QUALITY_REPORT` would never actually reach the socket in
  // production (only fake-timer tests that flush ticks synchronously in one
  // batch could hide this). Read the latest sample from the ref instead.
  useEffect(() => {
    if (!callId) return;

    const socket = meeshySocketIOService.getSocket();
    const interval = setInterval(() => {
      const stats = qualityStatsRef.current;
      if (!stats) return;
      socket?.emit(CLIENT_EVENTS.CALL_QUALITY_REPORT, {
        callId,
        stats: {
          level: stats.level,
          // ?? right-hand sides are unreachable: newStats always populates every field.
          rtt: stats.rtt ?? /* istanbul ignore next */ 0,
          packetLoss: stats.packetLoss ?? /* istanbul ignore next */ 0,
          bitrate: stats.bitrate ?? /* istanbul ignore next */ { audio: 0, video: 0 },
          jitter: stats.jitter ?? /* istanbul ignore next */ 0,
          timestamp: stats.timestamp ?? /* istanbul ignore next */ new Date(),
          bytesSent: stats.bytesSent ?? /* istanbul ignore next */ 0,
          bytesReceived: stats.bytesReceived ?? /* istanbul ignore next */ 0,
        },
      });
    }, 10_000);

    return () => clearInterval(interval);
  }, [callId]);

  return {
    qualityStats,
    isMonitoring: peerConnections.size > 0,
  };
}

/**
 * Get color for quality level
 */
export function getQualityColor(level: ConnectionQualityLevel): string {
  switch (level) {
    case 'excellent':
      return 'text-green-500';
    case 'good':
      return 'text-yellow-500';
    case 'fair':
      return 'text-orange-500';
    case 'poor':
      return 'text-red-500';
  }
}

/**
 * Get icon for quality level
 */
export function getQualityIcon(level: ConnectionQualityLevel): string {
  switch (level) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🟡';
    case 'fair':
      return '🟠';
    case 'poor':
      return '🔴';
  }
}

/**
 * Get label for quality level
 */
export function getQualityLabel(level: ConnectionQualityLevel): string {
  switch (level) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'poor':
      return 'Poor';
  }
}
