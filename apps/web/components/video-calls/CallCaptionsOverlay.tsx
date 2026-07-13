/**
 * CALL CAPTIONS OVERLAY
 *
 * Bottom-center strip rendering the live translated captions relayed by the
 * gateway (`call:translated-segment`, arc transcription live 2026-07-10).
 * Pure presentational — the consumption semantics (partial replacement,
 * retention, linger) live in useCallCaptions. Prisme: the translated text
 * reads as native content; partials are dimmed, never hidden.
 */

'use client';

import React, { memo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CallCaption } from '@/hooks/use-call-captions';

export interface CallCaptionsOverlayProps {
  captions: readonly CallCaption[];
  /** Maps a segment's speakerId to a display name; unknown speakers render text-only. */
  resolveSpeakerName?: (speakerId: string) => string | undefined;
}

export const CallCaptionsOverlay = memo(function CallCaptionsOverlay({
  captions,
  resolveSpeakerName,
}: CallCaptionsOverlayProps) {
  const { t } = useI18n('calls');

  if (captions.length === 0) return null;

  return (
    <div
      role="log"
      aria-label={t('calls.captions.region')}
      data-testid="call-captions"
      className="absolute bottom-28 left-1/2 z-10 w-full max-w-xl -translate-x-1/2 px-4"
    >
      <div className="rounded-xl bg-black/70 px-4 py-2 shadow backdrop-blur-sm">
        {captions.map((caption) => {
          const speakerName = resolveSpeakerName?.(caption.speakerId);
          return (
            <p
              key={caption.key}
              className={`text-sm leading-snug text-white ${caption.isFinal ? '' : 'opacity-70'}`}
            >
              {speakerName ? (
                <span className="mr-1 font-semibold text-indigo-300">{speakerName}</span>
              ) : null}
              {caption.text}
            </p>
          );
        })}
      </div>
    </div>
  );
});
