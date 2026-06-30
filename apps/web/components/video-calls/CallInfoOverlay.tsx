/**
 * CALL INFO OVERLAY
 *
 * Top-left cluster: elapsed call duration and active participant count.
 * Presentational; localizes the participant count (singular/plural).
 */

'use client';

import React, { memo } from 'react';
import { useI18n } from '@/hooks/useI18n';

export interface CallInfoOverlayProps {
  durationLabel: string;
  participantCount: number;
}

export const CallInfoOverlay = memo(function CallInfoOverlay({
  durationLabel,
  participantCount,
}: CallInfoOverlayProps) {
  const { t } = useI18n('calls');
  const participantLabel = t(
    participantCount === 1 ? 'info.participant' : 'info.participants',
    { count: participantCount }
  );
  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2">
      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
        <p className="text-white text-sm font-medium" data-testid="call-duration">
          {durationLabel}
        </p>
      </div>
      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
        <p className="text-white text-sm">{participantLabel}</p>
      </div>
    </div>
  );
});
