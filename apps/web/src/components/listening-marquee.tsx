import type { ListeningBand } from '@/lib/now-playing/listening-band';

/**
 * **LE BANDEAU DE L'ÉCOUTE, POSÉ SUR LE BAS DE L'AVATAR** (#16729) — dessin pur,
 * sans hook : `Avatar` est appelé comme une fonction par des témoins qui
 * rejouent l'arbre sans dispatcher. Il est `aria-hidden` : l'avatar dit l'écoute
 * avec le nom (`listening.spoken`), une seule fois.
 *
 * Sous 40 px (rangées de liste, puces), le bandeau ne serait plus lisible : il ne
 * se pose pas, et l'avatar le dit quand même au lecteur d'écran.
 */
export const LISTENING_BAND_MIN_SIZE = 40;

const SECONDS_PER_CHARACTER = 0.28;
const MIN_LOOP_SECONDS = 6;

export function ListeningMarquee({ band, size }: { readonly band: ListeningBand; readonly size: number }) {
  if (size < LISTENING_BAND_MIN_SIZE) return null;
  const height = Math.max(14, Math.round(size * 0.24));
  const line = `${band.glyph} ${band.text}`;
  const duration = Math.max(MIN_LOOP_SECONDS, line.length * SECONDS_PER_CHARACTER);
  return (
    <span
      data-listening-band=""
      aria-hidden
      className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-full"
      style={{
        bottom: 0,
        height,
        backgroundColor: 'color-mix(in srgb, var(--color-brand) 88%, transparent)',
        color: 'var(--color-on-state)',
        fontSize: Math.round(height * 0.62),
        lineHeight: `${height}px`,
      }}
    >
      <span data-listening-track="" className="inline-flex whitespace-nowrap font-semibold" style={{ ['--listening-duration' as string]: `${duration}s` }}>
        <span data-listening-copy="0" className="px-2">
          {line}
        </span>
        <span data-listening-copy="1" className="px-2">
          {line}
        </span>
      </span>
    </span>
  );
}
