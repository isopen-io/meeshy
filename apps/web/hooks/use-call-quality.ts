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
      // Excellent: < 1% packet loss, < 100ms RTT
      if (packetLoss < 1 && rtt < 100) {
        return 'excellent';
      }

      // Good: 1-3% packet loss, 100-200ms RTT
      if (packetLoss < 3 && rtt < 200) {
        return 'good';
      }

      // Fair: 3-5% packet loss, 200-300ms RTT
      if (packetLoss < 5 && rtt < 300) {
        return 'fair';
      }

      // Poor: > 5% packet loss or > 300ms RTT
      return 'poor';
    },
    []
  );

  /**
   * Get stats from peer connection
   */
  const updateStats = useCallback(async () => {
    /* istanbul ignore next -- stale-closure guard: React clears the interval before peerConnection can transition to null while this callback is still live */
    if (!peerConnection) return;

    try {
      const stats = await peerConnection.getStats();

      let packetLoss = 0;
      let rtt = 0;
      let audioBitrate = 0;
      let videoBitrate = 0;
      let jitter = 0;
      // Cumulative byte counters (summed across all RTP streams) — reported so
      // the gateway can persist real "data spent" on the call-summary message.
      let bytesSent = 0;
      let bytesReceived = 0;

      // Parse WebRTC stats
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp') {
          // Calculate packet loss
          const packetsLost = report.packetsLost || 0;
          const packetsReceived = report.packetsReceived || 0;
          const totalPackets = packetsLost + packetsReceived;

          if (totalPackets > 0) {
            packetLoss = (packetsLost / totalPackets) * 100;
          }

          // Get jitter
          if (report.jitter !== undefined) {
            jitter = report.jitter * 1000; // Convert to ms
          }

          bytesReceived += report.bytesReceived || 0;

          // Get bitrate
          if (report.kind === 'audio') {
            audioBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
          } else if (report.kind === 'video') {
            videoBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
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

      // Log quality changes
      if (qualityStats?.level !== level) {
        logger.info('[useCallQuality]', 'Quality level changed', {
          from: qualityStats?.level,
          to: level,
          stats: newStats,
        });
      }
    } catch (error) {
      logger.error('[useCallQuality]', 'Failed to get stats', { error });
    }
  }, [peerConnection, calculateQualityLevel, qualityStats?.level]);

  /**
   * Start monitoring when peer connection is available
   */
  useEffect(() => {
    if (!peerConnection) {
      setQualityStats(null);
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
