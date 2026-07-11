/**
 * CALL QUALITY OVERLAY
 *
 * Top-right cluster: the connection quality badge plus a discreet survival pill
 * shown when the adaptive controller has dropped outbound video to keep the
 * call alive (Prisme: subtle, non-intrusive). Pure presentational.
 */

'use client';

import React, { memo } from 'react';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import { useI18n } from '@/hooks/useI18n';
import { ConnectionQualityBadge } from './ConnectionQualityBadge';

export interface CallQualityOverlayProps {
  stats: ConnectionQualityStats | null;
  showStats?: boolean;
  /** Outbound video auto-suspended by the controller. */
  videoSuspended?: boolean;
  /** The user's camera intent — the pill only shows when they actually want video. */
  userWantsVideo?: boolean;
  /** The PEER's link is degraded (`call:quality-alert` — never the local link). */
  remoteQualityDegraded?: boolean;
  /** The peer is capturing the call screen (`call:screen-capture-alert`). */
  remoteScreenCapturing?: boolean;
  /** Interpolated into the remote-alert labels ({name} placeholder). */
  participantName?: string;
}

export const CallQualityOverlay = memo(function CallQualityOverlay({
  stats,
  showStats = false,
  videoSuspended = false,
  userWantsVideo = false,
  remoteQualityDegraded = false,
  remoteScreenCapturing = false,
  participantName = '',
}: CallQualityOverlayProps) {
  const { t } = useI18n('calls');

  return (
    <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
      <ConnectionQualityBadge stats={stats} showAlways={showStats} />
      {videoSuspended && userWantsVideo && (
        <div
          role="status"
          data-testid="survival-pill"
          className="rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-white shadow"
        >
          {t('calls.toasts.videoSuspendedPoorConnection')}
        </div>
      )}
      {remoteQualityDegraded && (
        <div
          role="status"
          data-testid="remote-quality-pill"
          className="rounded-full bg-slate-800/90 px-3 py-1 text-xs font-medium text-white shadow"
        >
          {t('calls.remoteAlerts.qualityDegraded').replace('{name}', participantName)}
        </div>
      )}
      {remoteScreenCapturing && (
        <div
          role="status"
          data-testid="screen-capture-pill"
          className="rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white shadow"
        >
          {t('calls.remoteAlerts.screenCapturing').replace('{name}', participantName)}
        </div>
      )}
    </div>
  );
});
