import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioTrack } from '@/lib/stories/studio-timeline';

/**
 * **LA FRISE DU MODE ANIMÉ, SELON LA MAQUETTE** (`Main.dc.html`, lot 6 ;
 * #8415) — une plaque de verre au-dessus du socle :
 *  - lecture / pause, disque blanc ; « 1,2 s / 6 s » ;
 *  - « Entre ici » / « Sort ici » quand un objet est sélectionné (à l'arrêt) ;
 *  - une RÈGLE qu'on touche pour placer la tête ;
 *  - une PISTE par objet (libellé à gauche, barre t0 → t1) ; toucher une piste
 *    sélectionne l'objet ET place la tête là où l'on a touché ;
 *  - la tête de lecture, ambrée (#fbbf24).
 *
 * **60 fps** : la tête et le compteur suivent l'horloge du MOTEUR
 * (`SceneClockHandle.subscribe`) en écrivant le DOM, jamais un état React.
 */

const LABEL_COLUMN = 72;
const HEAD_COLOR = '#fbbf24';

const secondsLabel = (lang: InterfaceLanguage, value: number, digits: number): string =>
  new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

function PlayMark({ playing }: { readonly playing: boolean }) {
  return (
    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="#111">
      {playing ? (
        <>
          <rect x="5" y="4" width="5" height="16" rx="1" />
          <rect x="14" y="4" width="5" height="16" rx="1" />
        </>
      ) : (
        <path d="M7 4l13 8-13 8z" />
      )}
    </svg>
  );
}

/** La fraction touchée d'un élément — `0` quand il n'a pas de largeur. */
const fractionAt = (event: ReactPointerEvent<HTMLElement>): number => {
  const box = event.currentTarget.getBoundingClientRect();
  return box.width > 0 ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) : 0;
};

export function StudioTimelinePanel({
  lang,
  tracks,
  labelOf,
  selectedId,
  duration,
  clock,
  playing,
  onPlayPause,
  onSelect,
  onEnter,
  onExit,
}: {
  readonly lang: InterfaceLanguage;
  readonly tracks: readonly StudioTrack[];
  readonly labelOf: (track: StudioTrack) => string;
  readonly selectedId: string | null;
  readonly duration: number;
  /** L'horloge du MOTEUR de l'aperçu — `null` tant qu'il n'est pas monté. */
  readonly clock: SceneClockHandle | null;
  readonly playing: boolean;
  readonly onPlayPause: () => void;
  readonly onSelect: (id: string) => void;
  /** « Entre ici » / « Sort ici » — à la tête (`clock.now()`), pour l'objet sélectionné. */
  readonly onEnter: (head: number) => void;
  readonly onExit: (head: number) => void;
}) {
  const headRef = useRef<HTMLDivElement | null>(null);
  const nowRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (clock === null) return;
    const paint = (t: number) => {
      const fraction = Math.min(1, Math.max(0, t / duration));
      if (headRef.current !== null) headRef.current.style.left = `calc(${LABEL_COLUMN}px + (100% - ${LABEL_COLUMN}px) * ${fraction})`;
      if (nowRef.current !== null) nowRef.current.textContent = secondsLabel(lang, Math.min(t, duration), 1);
    };
    paint(clock.now());
    return clock.subscribe(paint);
  }, [clock, duration, lang]);

  const seek = (fraction: number) => clock?.seek(fraction * duration);
  const head = (): number => clock?.now() ?? 0;
  const selected = !playing && tracks.some((track) => track.id === selectedId);

  return (
    <section data-story-timeline aria-label={translate(lang, 'story.studio.timeline')} className="glass flex flex-col gap-1.5 rounded-[20px] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-story-timeline-play={playing ? 'playing' : 'paused'}
          aria-label={translate(lang, playing ? 'story.studio.timeline.pause' : 'story.studio.timeline.play')}
          onClick={onPlayPause}
          className="grid size-11 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)' }}
        >
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full" style={{ backgroundColor: '#fff' }}>
            <PlayMark playing={playing} />
          </span>
        </button>
        <p className="flex-1 text-caption font-bold tabular-nums" style={{ color: 'var(--color-ios-ink)' }}>
          <span ref={nowRef} data-story-timeline-now>
            {secondsLabel(lang, 0, 1)}
          </span>
          {' s / '}
          <span data-story-timeline-duration>{secondsLabel(lang, duration, 0)}</span>
          {' s'}
        </p>
        {selected ? (
          <>
            <button type="button" data-story-timeline-enter onClick={() => onEnter(head())} className="glass h-11 rounded-xl px-3 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translate(lang, 'story.studio.timeline.enter')}
            </button>
            <button type="button" data-story-timeline-exit onClick={() => onExit(head())} className="glass h-11 rounded-xl px-3 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translate(lang, 'story.studio.timeline.exit')}
            </button>
          </>
        ) : null}
      </div>
      <div className="relative flex flex-col gap-1">
        <button
          type="button"
          data-story-timeline-ruler
          aria-label={translate(lang, 'story.studio.timeline.scrub')}
          onPointerDown={(event) => seek(fractionAt(event))}
          className="h-3.5 rounded-md"
          style={{ marginInlineStart: LABEL_COLUMN, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 12%, transparent)' }}
        />
        {tracks.length === 0 ? (
          <p className="py-1 text-caption" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(lang, 'story.studio.timeline.empty')}
          </p>
        ) : (
          tracks.map((track) => {
            const label = labelOf(track);
            const on = track.id === selectedId;
            return (
              <div key={track.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-caption" style={{ color: 'var(--color-ios-ink)' }}>
                  {label}
                </span>
                <button
                  type="button"
                  data-story-track={track.id}
                  data-story-track-start={track.timing.start}
                  data-story-track-end={track.timing.end}
                  aria-pressed={on}
                  aria-label={translate(lang, 'story.studio.timeline.track', { name: label })}
                  onPointerDown={(event) => {
                    onSelect(track.id);
                    seek(fractionAt(event));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onSelect(track.id);
                  }}
                  className="relative h-7 flex-1 rounded-lg focus-visible:outline-2"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)', outlineColor: 'var(--color-ios-brand)' }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 block rounded-lg"
                    style={{
                      left: `${(track.timing.start / duration) * 100}%`,
                      width: `${((track.timing.end - track.timing.start) / duration) * 100}%`,
                      backgroundColor: on ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-brand) 45%, transparent)',
                    }}
                  />
                </button>
              </div>
            );
          })
        )}
        <div
          ref={headRef}
          aria-hidden="true"
          data-story-timeline-head
          className="pointer-events-none absolute inset-y-0 w-0.5 rounded-sm"
          style={{ left: `${LABEL_COLUMN}px`, backgroundColor: HEAD_COLOR }}
        />
      </div>
    </section>
  );
}
