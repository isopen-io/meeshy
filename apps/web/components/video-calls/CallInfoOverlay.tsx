/**
 * CALL INFO OVERLAY
 *
 * Top-left cluster: elapsed call duration and active participant count.
 * Pure presentational.
 */

'use client';

import React, { memo } from 'react';

export interface CallInfoOverlayProps {
  durationLabel: string;
  participantCount: number;
}

export const CallInfoOverlay = memo(function CallInfoOverlay({
  durationLabel,
  participantCount,
}: CallInfoOverlayProps) {
  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2">
      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
        <p className="text-white text-sm font-medium" data-testid="call-duration">
          {durationLabel}
        </p>
      </div>
      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
        <p className="text-white text-sm">{participantCount} participant(s)</p>
      </div>
    </div>
  );
});
