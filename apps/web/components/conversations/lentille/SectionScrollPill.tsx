/**
 * `SectionScrollPill` — pilule de défilement (WL-103, LWS-10).
 *
 * Sticky CSS, ancrée sous le header (`--lentille-list-pill-top`), fondu
 * `--lentille-list-pill-fade-duration`. `visible` est piloté par
 * `scrollActivityLaw` via `useScrollActivity` (WL-104) — ce composant reste
 * une peau PURE : il ne connaît ni horloge ni timer, seulement l'état déjà
 * résolu par le hook.
 *
 * `aria-hidden="true"` — même raison que `LentilleSticker` : décorative,
 * l'information vit dans l'ordre du DOM (contrat LWS-10).
 */
'use client';

import { cn } from '@/lib/utils';

export interface SectionScrollPillProps {
  readonly label: string;
  readonly visible: boolean;
}

export function SectionScrollPill({ label, visible }: SectionScrollPillProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="lentille-scroll-pill"
      data-visible={visible}
      className={cn(
        'sticky z-20 mx-auto w-fit pointer-events-none rounded-full bg-card/90 backdrop-blur-sm shadow-sm transition-opacity',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        top: 'var(--lentille-list-pill-top)',
        transitionDuration: 'var(--lentille-list-pill-fade-duration)',
        fontSize: 'var(--lentille-list-sticker-size)',
        fontWeight: 'var(--lentille-list-sticker-weight)',
        padding: 'var(--lentille-list-sticker-padding-vertical) var(--lentille-list-sticker-padding-horizontal)',
      }}
    >
      {label}
    </div>
  );
}

export default SectionScrollPill;
