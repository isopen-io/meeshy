import { useEffect, useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { VIEWER_GLASS } from './viewer-chrome';

/** Un buffer plus court (un seek, un tour de boucle) ne fait rien clignoter —
 * le délai de grâce d'iOS (`stallIndicatorGraceTask`). */
export const STALL_INDICATOR_GRACE_MS = 350;

/**
 * L'ATTENTE D'UN MÉDIA EN PLEINE LECTURE (#9277) — miroir de
 * `StoryPlaybackStallIndicator` (`StoryViewerView+Canvas.swift`) : une roue
 * discrète au centre, sur le verre des plein écrans, quand la scène est gelée
 * par un buffer. Sans elle, l'image figée est indiscernable d'un plantage.
 * Elle paraît après la grâce et disparaît dès la reprise ; elle ne prend
 * jamais le doigt.
 */
export function PlaybackStallIndicator({ stalled, language }: { readonly stalled: boolean; readonly language: InterfaceLanguage }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!stalled) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), STALL_INDICATOR_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [stalled]);
  if (!stalled || !shown) return null;
  return (
    <span
      data-playback-stall
      role="status"
      aria-label={translate(language, 'media.buffering')}
      className={`${VIEWER_GLASS} pointer-events-none absolute start-1/2 top-1/2 z-10 grid size-13 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full rtl:translate-x-1/2`}
    >
      <span aria-hidden="true" className="block size-6 animate-spin rounded-full border-2 border-on-media border-t-transparent motion-reduce:animate-none" />
    </span>
  );
}
