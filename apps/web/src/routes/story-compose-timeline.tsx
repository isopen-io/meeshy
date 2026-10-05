import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioTiming } from '@/lib/stories/studio-text';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { STUDIO_PLATE } from '@/routes/story-compose-chrome';
import { draggedTiming, type StudioTrack, type StudioTrackGrip } from '@/lib/stories/studio-timeline';

/**
 * **LA FRISE DU MODE ANIMÉ, SELON LA MAQUETTE** (`Main.dc.html`, lot 6 ;
 * #8415) — une plaque de verre au-dessus du socle :
 *  - lecture / pause, disque blanc ; « 1,2 s / 6 s » ;
 *  - « Entre ici » / « Sort ici » quand un objet est sélectionné — aussi
 *    pendant la lecture (lot 7, les jetons suivent la sélection) ;
 *  - une RÈGLE qu'on touche pour placer la tête ;
 *  - une PISTE par objet (libellé à gauche, barre t0 → t1) ; toucher une piste
 *    sélectionne l'objet ET place la tête là où l'on a touché ;
 *  - la tête de lecture, ambrée (#fbbf24).
 *
 * **UNE PISTE SE RÈGLE À LA MAIN** (lot 7, retour porteur 2026-09-28, miroir
 * `ComposerSceneFrise.swift`) : glisser sa barre la DÉPLACE (durée gardée,
 * bornée à la scène) ; ses deux poignées, sur la piste choisie, l'allongent
 * ou la raccourcissent sans se croiser (`draggedTiming`). Le geste se peint
 * en APERÇU local ; le projet ne reçoit la fenêtre qu'au lâcher — UN seul pas
 * d'historique. Au clavier, les flèches la déplacent plus tôt / plus tard.
 *
 * **60 fps** : la tête et le compteur suivent l'horloge du MOTEUR
 * (`SceneClockHandle.subscribe`) en écrivant le DOM, jamais un état React.
 */

const LABEL_COLUMN = 72;
const HEAD_COLOR = '#fbbf24';
/** Un geste sous ce seuil (px) est un TOUCHER, pas un glissé. */
const DRAG_THRESHOLD = 3;
/** Le pas d'une flèche (« Plus tôt » / « Plus tard »), celui d'iOS. */
const KEY_STEP = 0.5;
const HANDLE_HIT = 24;

type Drag = {
  readonly id: string;
  readonly grip: StudioTrackGrip;
  readonly origin: StudioTiming;
  readonly x: number;
  readonly width: number;
  readonly left: number;
  moved: boolean;
};

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
  onTiming,
  onClose,
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
  /** LA FENÊTRE RÉGLÉE à la main — appelée UNE fois, au lâcher. */
  readonly onTiming: (id: string, timing: StudioTiming) => void;
  /** REFERMER la frise, comme la pastille Animé — le retour matériel et Échap
   * la referment, elle seule (#8517) ; la scène garde ses pistes. */
  readonly onClose: () => void;
}) {
  useBackDismiss(onClose, { escape: true });
  const headRef = useRef<HTMLDivElement | null>(null);
  const nowRef = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<Drag | null>(null);
  /** L'APERÇU du geste en cours — jamais le projet. */
  const [preview, setPreview] = useState<{ readonly id: string; readonly timing: StudioTiming } | null>(null);

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
  const selected = tracks.some((track) => track.id === selectedId);

  const startDrag = (track: StudioTrack, grip: StudioTrackGrip) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== undefined && event.button > 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const lane = event.currentTarget.closest<HTMLElement>('[data-story-track-lane]');
    const box = lane?.getBoundingClientRect() ?? { left: 0, width: 0 };
    drag.current = { id: track.id, grip, origin: track.timing, x: event.clientX, width: box.width, left: box.left, moved: false };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (current === null) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!current.moved) {
      current.moved = true;
      onSelect(current.id);
    }
    const delta = current.width > 0 ? (dx / current.width) * duration : 0;
    setPreview({ id: current.id, timing: draggedTiming(current.origin, current.grip, delta, duration) });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    drag.current = null;
    if (current === null) return;
    if (!current.moved) {
      onSelect(current.id);
      if (current.grip === 'move' && current.width > 0) seek(Math.min(1, Math.max(0, (event.clientX - current.left) / current.width)));
      return;
    }
    const delta = current.width > 0 ? ((event.clientX - current.x) / current.width) * duration : 0;
    setPreview(null);
    onTiming(current.id, draggedTiming(current.origin, current.grip, delta, duration));
  };

  const cancelDrag = () => {
    drag.current = null;
    setPreview(null);
  };

  const nudge = (track: StudioTrack, delta: number) => onTiming(track.id, draggedTiming(track.timing, 'move', delta, duration));

  const onTrackKey = (track: StudioTrack) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onSelect(track.id);
      nudge(track, event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(track.id);
  };

  const dragHandlers = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: cancelDrag };

  return (
    <section data-story-timeline aria-label={translate(lang, 'story.studio.timeline')} className={`${STUDIO_PLATE} glass flex flex-col gap-1.5 rounded-[20px] px-3 py-2.5`}>
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
          {` ${translate(lang, 'story.studio.timeline.unit')} / `}
          <span data-story-timeline-duration>{secondsLabel(lang, duration, 0)}</span>
          {` ${translate(lang, 'story.studio.timeline.unit')}`}
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
            const timing = preview?.id === track.id ? preview.timing : track.timing;
            return (
              <div key={track.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-caption" style={{ color: 'var(--color-ios-ink)' }}>
                  {label}
                </span>
                <div data-story-track-lane className="relative h-[30px] flex-1">
                  <button
                    type="button"
                    data-story-track={track.id}
                    data-story-track-start={timing.start}
                    data-story-track-end={timing.end}
                    aria-pressed={on}
                    aria-label={translate(lang, 'story.studio.timeline.track', { name: label })}
                    aria-keyshortcuts="ArrowLeft ArrowRight"
                    onPointerDown={(event) => {
                      onSelect(track.id);
                      seek(fractionAt(event));
                    }}
                    onKeyDown={onTrackKey(track)}
                    className="absolute inset-0 rounded-lg focus-visible:outline-2"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)', outlineColor: 'var(--color-ios-brand)' }}
                  />
                  <span
                    aria-hidden="true"
                    data-story-track-bar={track.id}
                    onPointerDown={startDrag(track, 'move')}
                    {...dragHandlers}
                    className="absolute inset-y-1 block cursor-grab rounded-lg"
                    style={{
                      left: `${(timing.start / duration) * 100}%`,
                      width: `max(4px, ${((timing.end - timing.start) / duration) * 100}%)`,
                      backgroundColor: on ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-brand) 45%, transparent)',
                      touchAction: 'none',
                    }}
                  />
                  {on
                    ? (['start', 'end'] as const).map((grip) => (
                        <span
                          key={grip}
                          aria-hidden="true"
                          data-story-track-grip={grip}
                          onPointerDown={startDrag(track, grip)}
                          {...dragHandlers}
                          className="absolute inset-y-0 grid cursor-ew-resize place-items-center"
                          style={{
                            left: `calc(${((grip === 'start' ? timing.start : timing.end) / duration) * 100}% - ${HANDLE_HIT / 2}px)`,
                            width: HANDLE_HIT,
                            touchAction: 'none',
                          }}
                        >
                          <span className="block h-[18px] w-1 rounded-full" style={{ backgroundColor: '#fff' }} />
                        </span>
                      ))
                    : null}
                </div>
                {on ? (
                  <>
                    <button type="button" data-story-track-earlier className="sr-only" onClick={() => nudge(track, -KEY_STEP)}>
                      {translate(lang, 'story.studio.timeline.earlier')}
                    </button>
                    <button type="button" data-story-track-later className="sr-only" onClick={() => nudge(track, KEY_STEP)}>
                      {translate(lang, 'story.studio.timeline.later')}
                    </button>
                  </>
                ) : null}
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
