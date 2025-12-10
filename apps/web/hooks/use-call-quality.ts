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

import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/utils/logger';
import type {
  ConnectionQualityLevel,
  ConnectionQualityStats,
} from '@meeshy/shared/types/video-call';

export interface UseCallQualityOptions {
  peerConnection: RTCPeerConnection | null;
  updateInterval?: number; // milliseconds
}

export function useCallQuality({
  peerConnection,
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
    if (!peerConnection) return;

    try {
      const stats = await peerConnection.getStats();

      let packetLoss = 0;
      let rtt = 0;
      let audioBitrate = 0;
      let videoBitrate = 0;
      let jitter = 0;

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

          // Get bitrate
          if (report.kind === 'audio') {
            audioBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
          } else if (report.kind === 'video') {
            videoBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
          }
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
