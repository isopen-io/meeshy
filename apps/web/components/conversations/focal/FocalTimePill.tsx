/**
 * `FocalTimePill` — pilule « Mercredi · 17:42 » (WF-111, contrat Focal §WS-2 :
 * « pilule jour · heure sur `scrollActivityLaw` partagée »).
 *
 * MÊME patron que `SectionScrollPill` (WL-103, liste) : `position: sticky`,
 * `aria-hidden="true"` (décorative — même raison), `visible` entièrement
 * piloté par `useScrollActivity` (WL-104, hook PARTAGÉ, consommé tel quel —
 * pas de second minuteur). Cotes par les tokens `--lentille-thread-pill-*`
 * (top `72`, fondu `280ms` — distincts des `--lentille-list-pill-*`, MÊME
 * loi `SCROLL_ACTIVITY_LINGER_MS` de 900 ms — §4.3 : « idem » sur la ligne
 * dismiss).
 */
'use client';

import { cn } from '@/lib/utils';

export interface FocalTimePillProps {
  readonly label: string;
  readonly visible: boolean;
}

export function FocalTimePill({ label, visible }: FocalTimePillProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="focal-time-pill"
      data-visible={visible}
      className={cn(
        'sticky z-20 mx-auto w-fit pointer-events-none rounded-full bg-card/90 backdrop-blur-sm shadow-sm transition-opacity',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        top: 'var(--lentille-thread-pill-top)',
        transitionDuration: 'var(--lentille-thread-pill-fade-duration)',
        fontSize: 'var(--lentille-list-sticker-size)',
        fontWeight: 'var(--lentille-list-sticker-weight)',
        padding: 'var(--lentille-list-sticker-padding-vertical) var(--lentille-list-sticker-padding-horizontal)',
      }}
    >
      {label}
    </div>
  );
}

export default FocalTimePill;
