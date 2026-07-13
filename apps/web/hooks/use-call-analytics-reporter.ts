/**
 * USE CALL ANALYTICS REPORTER
 * Emits the once-per-call `call:analytics` telemetry the web never sent —
 * closing the emission gap that left the reliability dashboard blind to web
 * calls (prod 2026-07-12: 100% of persisted analytics were iOS). Parité iOS
 * `emitCallAnalyticsSnapshot` / Android `CallViewModel.reportAnalytics`.
 *
 * Accumulates the call's telemetry via the pure `call-analytics` accumulator
 * (connect delay, reconnections, per-sample quality) and fires exactly ONE
 * `call:analytics` at teardown. Emit-once is ref-guarded; the accumulation
 * effects read fresh values, the teardown effect runs only on final unmount.
 */

'use client';

import { useEffect, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import {
  createCallAnalytics,
  markConnected,
  markReconnecting,
  addQualitySample,
  buildAnalyticsPayload,
  type CallAnalyticsAccumulator,
} from '@/lib/call-analytics';

export function useCallAnalyticsReporter(params: {
  callId: string | null;
  connectionState: string;
  qualityStats: ConnectionQualityStats | null;
  isVideo: boolean;
}): void {
  const { callId, connectionState, qualityStats, isVideo } = params;

  const accRef = useRef<CallAnalyticsAccumulator>(createCallAnalytics(Date.now()));
  const reportedRef = useRef(false);
  const prevStateRef = useRef(connectionState);
  // Latest identity for the teardown emit (kept in refs so the unmount effect
  // can run with empty deps and never fire early on an isVideo/callId change).
  const callIdRef = useRef(callId);
  const isVideoRef = useRef(isVideo);
  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { isVideoRef.current = isVideo; }, [isVideo]);

  useEffect(() => {
    if (connectionState === 'connected') {
      accRef.current = markConnected(accRef.current, Date.now());
    }
    if (connectionState === 'reconnecting' && prevStateRef.current !== 'reconnecting') {
      accRef.current = markReconnecting(accRef.current);
    }
    prevStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    if (qualityStats) {
      accRef.current = addQualitySample(accRef.current, {
        level: qualityStats.level,
        rtt: qualityStats.rtt,
        packetLoss: qualityStats.packetLoss,
      });
    }
  }, [qualityStats]);

  useEffect(() => {
    return () => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const id = callIdRef.current;
      if (!id) return;
      const acc = accRef.current;
      // Best-effort end reason: a call that never connected is a missed setup;
      // a connected call torn down here is a local hangup. The gateway
      // normalizes and the aggregate breaks down by reason.
      const endReason = acc.connectedAtMs !== null ? 'local' : 'missed';
      const payload = buildAnalyticsPayload(acc, {
        callId: id, nowMs: Date.now(), isVideo: isVideoRef.current, endReason,
      });
      meeshySocketIOService.getSocket()?.emit(CLIENT_EVENTS.CALL_ANALYTICS, payload);
    };
  }, []);
}
