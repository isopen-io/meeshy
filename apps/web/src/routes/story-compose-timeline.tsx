import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioTiming } from '@/lib/stories/studio-text';
import { timingEnteringAt, timingExitingAt, type StudioTrack } from '@/lib/stories/studio-timeline';
import { STUDIO_PLATE } from '@/routes/story-compose-chrome';
import { draggedTiming, secondsForDelta, trackKeyStep, type TrackGrip } from '@/lib/stories/studio-track-drag';

/**
 * **LA FRISE DU MODE ANIMÉ, SELON LA MAQUETTE** (`Main.dc.html`, lot 6 ;
 * #8415) — une plaque de verre au-dessus du socle :
 *  - lecture / pause, disque blanc ; « 1,2 s / 6 s » ;
 *  - « Entre ici » / « Sort ici » quand un objet est sélectionné, à l'arrêt
 *    COMME en lecture (retour porteur 2026-09-28, #8482) ;
 *  - une RÈGLE qu'on touche pour placer la tête ;
 *  - une PISTE par objet (libellé à gauche, barre t0 → t1) ; toucher une piste
 *    sélectionne l'objet ET place la tête là où l'on a touché — pendant la
 *    lecture aussi ;
 *  - **la BARRE se GLISSE** : l'objet se déplace dans le temps, sa durée
 *    gardée ; **deux ANCRES** à ses bouts règlent son entrée et sa sortie
 *    (#8482, miroir iOS #8473). Les ancres ne paraissent que sur la piste
 *    choisie, saisies sur 28 px ; pointeur, doigt et clavier (flèches : 0,1 s,
 *    Maj : 1 s) font la même chose (`studio-track-drag.ts`) ;
 *  - la tête de lecture, ambrée (#fbbf24).
 *
 * **60 fps** : la tête et le compteur suivent l'horloge du MOTEUR
 * (`SceneClockHandle.subscribe`) en écrivant le DOM, jamais un état React.
 */

const LABEL_COLUMN = 72;
const HEAD_COLOR = '#fbbf24';
/** La largeur SAISIE d'une ancre, bien plus large que son trait (iOS : 28 pt). */
const HANDLE_HIT = 28;
/** En deçà, un appui sur la barre est un TAP (placer la tête), pas un glisser. */
const TAP_SLOP = 3;

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

/** La fraction d'une abscisse sur une boîte — `0` quand elle n'a pas de largeur. */
const fractionOf = (clientX: number, box: DOMRect): number =>
  box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;

const fractionAt = (event: ReactPointerEvent<HTMLElement>): number => fractionOf(event.clientX, event.currentTarget.getBoundingClientRect());

/** Le geste EN COURS sur une piste — mesuré depuis la fenêtre du DÉBUT du
 * geste, jamais depuis celle déjà déplacée. `moved` dit s'il a quitté le tap. */
type TrackGesture = {
  readonly id: string;
  readonly grip: TrackGrip;
  readonly origin: StudioTiming;
  readonly x0: number;
  readonly lane: DOMRect;
  readonly key: string;
  readonly moved: boolean;
};

const capture = (event: ReactPointerEvent<HTMLElement>) => {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Un pointeur synthétique (témoin) ou déjà relâché ne se capture pas.
  }
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
  onRetime,
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
  /** La fenêtre d'une piste change — `key` coalise un même geste en UN pas d'historique. */
  readonly onRetime: (id: string, timing: StudioTiming, key: string) => void;
}) {
  const headRef = useRef<HTMLDivElement | null>(null);
  const nowRef = useRef<HTMLSpanElement | null>(null);
  const gestureRef = useRef<TrackGesture | null>(null);
  const gestureCount = useRef(0);

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
  const selectedTrack = tracks.find((track) => track.id === selectedId) ?? null;

  const startGesture = (event: ReactPointerEvent<HTMLElement>, track: StudioTrack, grip: TrackGrip) => {
    event.stopPropagation();
    const lane = event.currentTarget.closest('[data-story-track]');
    if (lane === null) return;
    capture(event);
    onSelect(track.id);
    gestureCount.current += 1;
    gestureRef.current = {
      id: track.id,
      grip,
      origin: track.timing,
      x0: event.clientX,
      lane: lane.getBoundingClientRect(),
      key: `timing:${track.id}:${gestureCount.current}`,
      moved: false,
    };
  };

  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null) return;
    const dx = event.clientX - gesture.x0;
    if (!gesture.moved && Math.abs(dx) < TAP_SLOP) return;
    gestureRef.current = { ...gesture, moved: true };
    const delta = secondsForDelta({ dx, width: gesture.lane.width, duration });
    onRetime(gesture.id, draggedTiming({ origin: gesture.origin, grip: gesture.grip, delta, duration }), gesture.key);
  };

  /** Un appui sur la barre qui n'a pas glissé est un TAP : la tête va là. */
  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture !== null && !gesture.moved && gesture.grip === 'bar') seek(fractionOf(event.clientX, gesture.lane));
  };

  const nudge = (event: ReactKeyboardEvent<HTMLElement>, track: StudioTrack, grip: TrackGrip) => {
    const step = trackKeyStep(event.key, event.shiftKey);
    if (step === null) return;
    event.preventDefault();
    onSelect(track.id);
    onRetime(track.id, draggedTiming({ origin: track.timing, grip, delta: step, duration }), `timing:${track.id}:keys`);
  };

  const gripHandlers = (track: StudioTrack, grip: TrackGrip) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startGesture(event, track, grip),
    onPointerMove: moveGesture,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => nudge(event, track, grip),
  });

  const retimeSelected = (law: (timing: StudioTiming, head: number, duration: number) => StudioTiming, edge: string) => {
    if (selectedTrack !== null) onRetime(selectedTrack.id, law(selectedTrack.timing, head(), duration), `timing:${selectedTrack.id}:${edge}`);
  };

  return (
    <section data-story-timeline aria-label={translate(lang, 'story.studio.timeline')} className={`${STUDIO_PLATE} glass flex flex-col gap-1.5 rounded-[20px] px-4 py-2.5`}>
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
        {selectedTrack !== null ? (
          <>
            <button type="button" data-story-timeline-enter onClick={() => retimeSelected(timingEnteringAt, 'enter')} className="glass h-11 rounded-xl px-3 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translate(lang, 'story.studio.timeline.enter')}
            </button>
            <button type="button" data-story-timeline-exit onClick={() => retimeSelected(timingExitingAt, 'exit')} className="glass h-11 rounded-xl px-3 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
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
            const left = (track.timing.start / duration) * 100;
            const right = (track.timing.end / duration) * 100;
            return (
              <div key={track.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-caption" style={{ color: 'var(--color-ios-ink)' }}>
                  {label}
                </span>
                {/* LA VOIE — toucher hors de la barre choisit la piste et place la tête. */}
                <div
                  data-story-track={track.id}
                  data-story-track-start={track.timing.start}
                  data-story-track-end={track.timing.end}
                  onPointerDown={(event) => {
                    onSelect(track.id);
                    seek(fractionAt(event));
                  }}
                  className="relative h-7 flex-1 rounded-lg"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)' }}
                >
                  <button
                    type="button"
                    data-story-track-bar={track.id}
                    aria-pressed={on}
                    aria-label={translate(lang, 'story.studio.timeline.track', { name: label })}
                    {...gripHandlers(track, 'bar')}
                    onClick={() => onSelect(track.id)}
                    className="absolute inset-y-0 block touch-none rounded-lg focus-visible:outline-2"
                    style={{
                      left: `${left}%`,
                      width: `${right - left}%`,
                      cursor: 'grab',
                      outlineColor: 'var(--color-ios-brand)',
                      backgroundColor: on ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-brand) 45%, transparent)',
                    }}
                  />
                  {on
                    ? (['start', 'end'] as const).map((grip) => (
                        <button
                          key={grip}
                          type="button"
                          data-story-track-handle={grip}
                          aria-label={translate(lang, grip === 'start' ? 'story.studio.timeline.enter' : 'story.studio.timeline.exit')}
                          {...gripHandlers(track, grip)}
                          className="absolute inset-y-0 z-10 grid touch-none place-items-center focus-visible:outline-2"
                          style={{
                            left: `calc(${grip === 'start' ? left : right}% - ${HANDLE_HIT / 2}px)`,
                            width: `${HANDLE_HIT}px`,
                            minHeight: `${HANDLE_HIT}px`,
                            cursor: 'ew-resize',
                            outlineColor: 'var(--color-ios-brand)',
                          }}
                        >
                          <span aria-hidden="true" className="block h-5 w-[5px] rounded-full" style={{ backgroundColor: '#fff', boxShadow: '0 0 3px rgba(0,0,0,0.45)' }} />
                        </button>
                      ))
                    : null}
                </div>
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
