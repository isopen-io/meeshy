import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioTiming } from '@/lib/stories/studio-text';
import { clampTiming, type StudioTrack } from '@/lib/stories/studio-timeline';

/**
 * **LA FRISE DU MODE ANIMÉ** (#8415, miroir `SceneTimelinePanel` iOS, maquette
 * `Main.dc.html`) — lecture / pause, temps courant / durée, une PISTE par
 * objet posé avec sa fenêtre d'apparition (deux poignées), et la tête de
 * lecture. Chargée à la demande : elle ne pèse que si l'auteur ouvre Animé.
 *
 * **60 fps pendant la lecture** : la tête et le compteur suivent l'horloge du
 * MOTEUR (`SceneClockHandle.subscribe`) en écrivant le DOM directement, jamais
 * par un état React ; un glissé de poignée peint sa fenêtre en direct et ne
 * COMMET qu'au relâchement (un pas d'historique par geste).
 */

const TARGET = 44;
const KEY_STEP = 0.1;
const KEY_STEP_LARGE = 0.5;

const seconds = (lang: InterfaceLanguage, value: number): string =>
  `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} s`;

function PlayMark({ playing }: { readonly playing: boolean }) {
  return (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
      {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
    </svg>
  );
}

type Edge = 'start' | 'end';

function TrackRow({
  lang,
  track,
  label,
  duration,
  onTiming,
}: {
  readonly lang: InterfaceLanguage;
  readonly track: StudioTrack;
  readonly label: string;
  readonly duration: number;
  readonly onTiming: (id: string, timing: StudioTiming) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<StudioTiming | null>(null);
  const timing = live ?? track.timing;

  const moveEdge = (edge: Edge, value: number): StudioTiming =>
    clampTiming(edge === 'start' ? { start: value, end: timing.end } : { start: timing.start, end: value }, duration);

  const onDown = (edge: Edge) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    // Saisir une poignée n'est pas toucher la règle : le temps ne bouge pas.
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    let current = timing;
    const at = (clientX: number): number => {
      const box = barRef.current?.getBoundingClientRect();
      if (box === undefined || box.width <= 0) return edge === 'start' ? current.start : current.end;
      return ((clientX - box.left) / box.width) * duration;
    };
    const move = (e: PointerEvent) => {
      current = clampTiming(edge === 'start' ? { start: at(e.clientX), end: current.end } : { start: current.start, end: at(e.clientX) }, duration);
      setLive(current);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setLive(null);
      onTiming(track.id, current);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const onKey = (edge: Edge) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    onTiming(track.id, moveEdge(edge, (edge === 'start' ? timing.start : timing.end) + delta));
  };

  const handle = (edge: Edge) => {
    const value = edge === 'start' ? timing.start : timing.end;
    const name = translate(lang, edge === 'start' ? 'story.studio.timeline.start' : 'story.studio.timeline.end', { name: label });
    return (
      <button
        type="button"
        role="slider"
        data-story-track-handle={edge}
        aria-label={name}
        title={name}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={value}
        aria-valuetext={seconds(lang, value)}
        onPointerDown={onDown(edge)}
        onKeyDown={onKey(edge)}
        className="absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:outline-2"
        style={{ left: `${(value / duration) * 100}%`, width: TARGET, height: TARGET, touchAction: 'none', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span aria-hidden="true" className="block h-6 w-1.5 rounded-full" style={{ backgroundColor: '#fff' }} />
      </button>
    );
  };

  return (
    <li data-story-track={track.id} data-story-track-start={timing.start} data-story-track-end={timing.end} className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {label}
      </span>
      <div ref={barRef} className="relative h-11 flex-1">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 block h-7 -translate-y-1/2 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 12%, transparent)' }} />
        <span
          aria-hidden="true"
          className="absolute top-1/2 block h-7 -translate-y-1/2 rounded-lg"
          style={{
            left: `${(timing.start / duration) * 100}%`,
            width: `${((timing.end - timing.start) / duration) * 100}%`,
            backgroundColor: 'var(--color-ios-brand)',
          }}
        />
        {handle('start')}
        {handle('end')}
      </div>
    </li>
  );
}

export function StudioTimelinePanel({
  lang,
  tracks,
  labelOf,
  duration,
  clock,
  playing,
  onPlayPause,
  onTiming,
}: {
  readonly lang: InterfaceLanguage;
  readonly tracks: readonly StudioTrack[];
  readonly labelOf: (track: StudioTrack) => string;
  readonly duration: number;
  /** L'horloge du MOTEUR de l'aperçu — `null` tant qu'il n'est pas monté. */
  readonly clock: SceneClockHandle | null;
  readonly playing: boolean;
  readonly onPlayPause: () => void;
  readonly onTiming: (id: string, timing: StudioTiming) => void;
}) {
  const headRef = useRef<HTMLSpanElement | null>(null);
  const nowRef = useRef<HTMLSpanElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (clock === null) return;
    const paint = (t: number) => {
      const fraction = Math.min(1, Math.max(0, t / duration));
      if (headRef.current !== null) headRef.current.style.left = `${fraction * 100}%`;
      if (nowRef.current !== null) nowRef.current.textContent = seconds(lang, Math.min(t, duration));
    };
    paint(clock.now());
    return clock.subscribe(paint);
  }, [clock, duration, lang]);

  /** Toucher la règle POSE le temps — la scène s'y redessine, même en pause. */
  const seekAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = rulerRef.current?.getBoundingClientRect();
    if (clock === null || box === undefined || box.width <= 0 || event.clientX < box.left) return;
    clock.seek(Math.min(duration, Math.max(0, ((event.clientX - box.left) / box.width) * duration)));
  };

  const title = translate(lang, 'story.studio.timeline');
  return (
    <section data-story-timeline aria-label={title} className="glass flex flex-col gap-2 rounded-[22px] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-story-timeline-play={playing ? 'playing' : 'paused'}
          aria-label={translate(lang, playing ? 'story.studio.timeline.pause' : 'story.studio.timeline.play')}
          onClick={onPlayPause}
          className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--color-ios-brand)', color: '#fff', outlineColor: 'var(--color-ios-brand)' }}
        >
          <PlayMark playing={playing} />
        </button>
        <p className="text-caption font-semibold tabular-nums" style={{ color: 'var(--color-ios-ink)' }}>
          <span ref={nowRef} data-story-timeline-now>
            {seconds(lang, 0)}
          </span>
          {' / '}
          <span data-story-timeline-duration>{seconds(lang, duration)}</span>
        </p>
      </div>
      {tracks.length === 0 ? (
        <p className="text-caption" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, 'story.studio.timeline.empty')}
        </p>
      ) : (
        <div className="relative" onPointerDown={seekAt}>
          {/* La règle et la tête couvrent la colonne des barres, jamais celle des libellés. */}
          <div ref={rulerRef} className="pointer-events-none absolute inset-y-0 end-0 start-16 z-10">
            <span
              ref={headRef}
              aria-hidden="true"
              data-story-timeline-head
              className="absolute inset-y-0 block w-0.5 -translate-x-1/2"
              style={{ left: '0%', backgroundColor: '#F472B6' }}
            />
          </div>
          <ul className="relative flex max-h-40 flex-col gap-1 overflow-y-auto">
            {tracks.map((track) => (
              <TrackRow key={track.id} lang={lang} track={track} label={labelOf(track)} duration={duration} onTiming={onTiming} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
