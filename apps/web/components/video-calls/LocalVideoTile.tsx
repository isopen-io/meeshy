/**
 * LOCAL VIDEO TILE
 *
 * The draggable self-view. Beyond the raw camera preview it renders a dedicated
 * "video paused — weak connection" state when the adaptive controller has
 * auto-suspended outbound video. This is distinct from the user turning their
 * camera off: the camera intent is still ON, the network simply can't carry it,
 * so we show a reassuring "auto-resume" affordance rather than a plain avatar.
 *
 * Pure presentational component (props only) — fully testable.
 */

'use client';

import React, { memo } from 'react';
import { VideoOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { VideoStream } from './VideoStream';

export interface LocalVideoTileProps {
  stream: MediaStream | null;
  audioEnabled: boolean;
  /** The user's camera intent. */
  videoEnabled: boolean;
  /** Outbound video auto-suspended by the adaptive controller (weak link). */
  videoSuspended?: boolean;
  position: { x: number; y: number };
  isDragging?: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

export const LocalVideoTile = memo(function LocalVideoTile({
  stream,
  audioEnabled,
  videoEnabled,
  videoSuspended = false,
  position,
  isDragging = false,
  onDragStart,
}: LocalVideoTileProps) {
  const { t } = useI18n('calls');

  // Only treat as "suspended UI" when the user actually wants video — otherwise
  // it's a normal camera-off, handled by VideoStream's placeholder.
  const showSuspended = videoSuspended && videoEnabled;

  return (
    <div
      data-testid="local-video-tile"
      className={cn(
        'absolute rounded-lg overflow-hidden shadow-2xl cursor-move',
        'w-32 h-40 md:w-40 md:h-52',
        'transition-shadow hover:shadow-3xl',
        isDragging && 'cursor-grabbing',
        showSuspended && 'ring-2 ring-amber-400/80'
      )}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
    >
      <VideoStream
        stream={stream}
        muted={true}
        isLocal={true}
        className="w-full h-full object-cover transform -scale-x-100"
        participantName="You"
        isAudioEnabled={audioEnabled}
        // When suspended the local track is stopped; hide the dead <video>.
        isVideoEnabled={videoEnabled && !videoSuspended}
      />

      {showSuspended && (
        <div
          role="status"
          aria-live="polite"
          data-testid="local-video-suspended"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gray-900/85 backdrop-blur-sm px-2 text-center"
        >
          <div className="relative">
            <VideoOff className="w-7 h-7 text-amber-300" />
            <Loader2
              className="absolute -right-2 -top-2 w-3.5 h-3.5 text-amber-300 animate-spin"
              aria-hidden="true"
            />
          </div>
          <p className="text-[11px] font-semibold leading-tight text-white">
            {t('calls.stream.videoSuspended')}
          </p>
          <p className="text-[10px] leading-tight text-amber-200/90">
            {t('calls.stream.videoSuspendedHint')}
          </p>
        </div>
      )}
    </div>
  );
});
