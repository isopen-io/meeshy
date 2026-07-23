/**
 * USE CALL QUALITY HOOK
 * Monitors WebRTC connection quality in real-time
 *
 * Provides:
 * - Connection quality level (excellent/good/fair/poor)
 * - Detailed statistics (packet loss, RTT, bitrate, jitter)
 * - Automatic quality level calculation
 * - Real-time updates
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
  peerConnection: RTCPeerConnection | null;
  callId?: string | null;
  updateInterval?: number; // milliseconds
}

export function useCallQuality({
  peerConnection,
  callId = null,
  updateInterval = 1000,
}: UseCallQualityOptions) {
  const [qualityStats, setQualityStats] = useState<ConnectionQualityStats | null>(null);

  /**
   * Calculate quality level based on stats
   */
  const calculateQualityLevel = useCallback(
    (packetLoss: number, rtt: number): ConnectionQualityLevel => {
      // RTT boundaries are round-trip and calibrated for MOBILE / long-haul
      // links, not domestic wired: a 4G/5G baseline runs 150-300ms and an
      // intercontinental hop 250-350ms with zero congestion. The pre-fix
      // thresholds (good < 200ms, fair < 300ms) flipped those healthy calls
      // straight to the orange/red indicator at 00:06. Packet loss — the real
      // congestion signal — keeps its tighter bands. Mirrors the iOS ladder in
      // VideoQualityLevel.from (WebRTCTypes.swift): good < 300, fair < 450.

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
    },
    []
  );

  // Previous quality level, tracked outside React state purely so the
  // "level changed" debug log below can compare against it without making
  // `updateStats` depend on `qualityStats?.level` (see that dependency's
  // removal below for why).
  const previousLevelRef = useRef<ConnectionQualityLevel | undefined>(undefined);

  // Previous inbound cumulative byte counters + sample time, tracked outside
  // React state so `bitrate` can be derived as a RATE (delta over elapsed time)
  // rather than from the ever-growing cumulative `bytesReceived` counter. Reset
  // to null whenever the peer connection changes so a rate is never computed
  // across two different calls (see the monitoring effect's cleanup).
  const previousInboundRef = useRef<{
    audioBytes: number;
    videoBytes: number;
    timestamp: number;
  } | null>(null);

  /**
   * Get stats from peer connection
   */
  const updateStats = useCallback(async () => {
    /* istanbul ignore next -- stale-closure guard: React clears the interval before peerConnection can transition to null while this callback is still live */
    if (!peerConnection) return;

    try {
      const stats = await peerConnection.getStats();

      let rtt = 0;
      let jitter = 0;
      // Current cumulative inbound bytes, summed per kind across all streams of
      // that kind, plus the sample time — used below to derive the bitrate rate.
      let audioBytesReceived = 0;
      let videoBytesReceived = 0;
      let sampleTimestamp = 0;
      // Cumulative counters summed across ALL inbound RTP streams (audio +
      // video). Packet loss is aggregated the same way as the byte counters so
      // a lossy stream can never be masked by a healthy one iterated after it —
      // reassigning per-report kept only the last stream's loss.
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;
      let bytesSent = 0;
      let bytesReceived = 0;

      // Parse WebRTC stats
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

      // Overall inbound packet-loss percentage across all streams
      const totalPackets = totalPacketsLost + totalPacketsReceived;
      const packetLoss =
        totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0;

      // Bitrate is a RATE: the delta of the monotonic `bytesReceived` counter
      // over the wall-clock interval between samples (report.timestamp, robust
      // to updateInterval drift) — NOT the cumulative counter itself, which
      // only grows and would make the reported bitrate climb without bound over
      // the call's duration. The first sample has no predecessor, so its rate is
      // 0; a counter reset (renegotiation) yields a negative delta, clamped to 0.
      // Result unit is kbps: (bytes·8 bits) / (elapsed ms) = kbits/s.
      const previousInbound = previousInboundRef.current;
      const elapsedMs = previousInbound ? sampleTimestamp - previousInbound.timestamp : 0;
      const bitrateKbps = (current: number, previous: number): number =>
        elapsedMs > 0 ? (Math.max(0, current - previous) * 8) / elapsedMs : 0;
      const audioBitrate = previousInbound
        ? bitrateKbps(audioBytesReceived, previousInbound.audioBytes)
        : 0;
      const videoBitrate = previousInbound
        ? bitrateKbps(videoBytesReceived, previousInbound.videoBytes)
        : 0;
      previousInboundRef.current = {
        audioBytes: audioBytesReceived,
        videoBytes: videoBytesReceived,
        timestamp: sampleTimestamp,
      };

      // Calculate quality level
      const level = calculateQualityLevel(packetLoss, rtt);

      // Create quality stats object
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
        });
      }
      previousLevelRef.current = level;
    } catch (error) {
      logger.error('[useCallQuality]', 'Failed to get stats', { error });
    }
  }, [peerConnection, calculateQualityLevel]);

  /**
   * Start monitoring when peer connection is available
   */
  useEffect(() => {
    if (!peerConnection) {
      setQualityStats(null);
      previousInboundRef.current = null;
      return;
    }

    logger.debug('[useCallQuality]', 'Starting quality monitoring', {
      updateInterval,
    });

    // Initial update
    updateStats();

    // Set up interval for updates
    const interval = setInterval(updateStats, updateInterval);

    return () => {
      clearInterval(interval);
      // Drop the previous-sample snapshot so a fresh peer connection never
      // computes a bitrate delta straddling two different calls.
      previousInboundRef.current = null;
      logger.debug('[useCallQuality]', 'Stopped quality monitoring');
    };
  }, [peerConnection, updateInterval, updateStats]);

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
    isMonitoring: peerConnection !== null,
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
