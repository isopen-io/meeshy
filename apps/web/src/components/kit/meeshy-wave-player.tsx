import '@/styles/kit-wave-player.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';
import { formatMediaTime, seekFraction } from '@/lib/view/seek-track';

import {
  MEESHY_WAVE_PLAYER_MEASURE,
  meeshyWaveBarStyle,
  meeshyWaveBarsLaw,
  meeshyWavePlayerRecipe,
  meeshyWavePlayerStyle,
  type MeeshyWavePlayerClock,
  type MeeshyWavePlayerPhase,
  type MeeshyWavePlayerRecipe,
  type MeeshyWavePlayerSize,
  type MeeshyWavePlayerWords,
} from './meeshy-wave-player-recipe';

export * from './meeshy-wave-player-recipe';

export type MeeshyWavePlayerProps = {
  readonly label: string;
  readonly words: MeeshyWavePlayerWords;
  readonly progress: number;
  readonly isPlaying: boolean;
  readonly onToggle: () => void;
  readonly samples?: readonly number[] | undefined;
  readonly duration?: number | undefined;
  readonly size?: MeeshyWavePlayerSize | undefined;
  readonly phase?: MeeshyWavePlayerPhase | undefined;
  readonly clock?: MeeshyWavePlayerClock | undefined;
  readonly tint?: string | undefined;
  readonly caption?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onScrub?: ((fraction: number) => void) | undefined;
  readonly onScrubbingChange?: ((isScrubbing: boolean) => void) | undefined;
  readonly className?: string | undefined;
};

const FALLBACK_WIDTH = 240;

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isRightToLeft = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

const svg = (path: string, fill: boolean): ReactNode => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const GLYPHS: Readonly<Record<MeeshyWavePlayerRecipe['glyphKind'], ReactNode>> = {
  play: svg('M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5Z', true),
  pause: svg('M8 5h2.5v14H8zM13.5 5H16v14h-2.5z', true),
  replay: svg('M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4', false),
};

const Bar = memo(function Bar({ height, index, isPlayed }: { readonly height: number; readonly index: number; readonly isPlayed: boolean }) {
  return <span className="kit-wave__bar" data-kit-wave-bar="" data-played={isPlayed ? '' : undefined} style={meeshyWaveBarStyle(height, index)} />;
});

type BarsProps = { readonly samples?: readonly number[] | undefined; readonly progress: number; readonly isLive: boolean; readonly width?: number | undefined; readonly waveHeight?: number | undefined };

/** L'onde seule : des barres muettes, les jouées en pleine teinte, les à-venir à 30 %. Seules les barres de la frontière se repeignent. */
export function MeeshyWaveBars({ samples, progress, isLive, width = FALLBACK_WIDTH, waveHeight = MEESHY_WAVE_PLAYER_MEASURE.row.waveHeight }: BarsProps) {
  const heights = useMemo(() => meeshyWaveBarsLaw.heights(meeshyWaveBarsLaw.resample(samples ?? [], width), waveHeight), [samples, width, waveHeight]);
  const filled = meeshyWaveBarsLaw.filled(progress, heights.length);
  return (
    <span className="kit-wave__bars" data-kit-wave-bars="" data-live={isLive ? '' : undefined} aria-hidden="true">
      {heights.map((height, index) => (
        <Bar key={index} height={height} index={index} isPlayed={index < filled} />
      ))}
    </span>
  );
}

const useWidth = (): readonly [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const measured = Math.round(node.getBoundingClientRect().width);
      if (measured > 0) setWidth((previous) => (previous === measured ? previous : measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

type Scrub = { readonly isActive: boolean; readonly fraction: number };

function useScrub(props: MeeshyWavePlayerProps) {
  const { onScrub, onScrubbingChange } = props;
  const [scrub, setScrub] = useState<Scrub>({ isActive: false, fraction: 0 });
  const live = useRef(scrub);
  const aim = (event: ReactPointerEvent<HTMLElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = seekFraction({ clientX: event.clientX, left: box.left, width: box.width });
    return isRightToLeft() ? 1 - fraction : fraction;
  };
  const set = (next: Scrub): void => {
    live.current = next;
    setScrub(next);
  };
  return {
    scrub,
    handlers:
      onScrub === undefined
        ? {}
        : {
            onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              set({ isActive: true, fraction: aim(event) });
              onScrubbingChange?.(true);
            },
            onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
              if (live.current.isActive) set({ isActive: true, fraction: aim(event) });
            },
            onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
              if (!live.current.isActive) return;
              const fraction = aim(event);
              set({ isActive: false, fraction });
              onScrub(fraction);
              onScrubbingChange?.(false);
            },
            onPointerCancel: () => {
              if (!live.current.isActive) return;
              set({ isActive: false, fraction: live.current.fraction });
              onScrubbingChange?.(false);
            },
          },
  };
}

function Zone({ props, recipe, width }: { readonly props: MeeshyWavePlayerProps; readonly recipe: MeeshyWavePlayerRecipe; readonly width: number }) {
  const { samples, onScrub, words, duration } = props;
  const { scrub, handlers } = useScrub(props);
  const shown = recipe.shownProgress;
  const total = duration !== undefined && duration > 0 ? Math.round(duration) : 100;
  const elapsed = Math.round(shown * total);
  const bars = <MeeshyWaveBars samples={samples} progress={shown} isLive={recipe.barsLive} width={width} waveHeight={recipe.waveHeight} />;
  const marker = scrub.isActive ? (
    <span className="kit-wave__marker" data-kit-wave-marker="" aria-hidden="true" style={{ insetInlineStart: `${shown * 100}%` }}>
      <span className="kit-wave__time">{formatMediaTime(elapsed)}</span>
    </span>
  ) : null;
  if (onScrub === undefined) {
    return (
      <div className="kit-wave__zone" data-kit-wave-zone="" role="img" aria-label={words.position}>
        {bars}
      </div>
    );
  }
  const jump = (fraction: number): void => onScrub(fraction);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const step = MEESHY_WAVE_PLAYER_MEASURE.keyStep;
    const forward = isRightToLeft() ? -step : step;
    if (event.key === 'ArrowRight') jump(clampUnit(shown + forward));
    else if (event.key === 'ArrowLeft') jump(clampUnit(shown - forward));
    else if (event.key === 'Home') jump(0);
    else if (event.key === 'End') jump(1);
    else return;
    event.preventDefault();
  };
  return (
    <div
      className="kit-wave__zone"
      data-kit-wave-zone=""
      data-scrubbing={scrub.isActive ? '' : undefined}
      role="slider"
      tabIndex={0}
      aria-label={words.position}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={elapsed}
      aria-valuetext={words.positionText(elapsed, total)}
      onKeyDown={onKeyDown}
      {...handlers}
    >
      {bars}
      {marker}
    </div>
  );
}

const clampUnit = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * Un lecteur de son court : un disque (bouton nommé « Lire, <label> »), une onde (réglable
 * si `onScrub` existe : glisser, flèches, Début, Fin), une durée qui ne bouge pas de place.
 * `onToggle` part une fois au relâcher, `onScrub` une fois au relâcher, borné de 0 à 1. Il
 * ne joue rien : un lecteur au repos ne coûte rien, et une lecture en cours ne repeint
 * que les barres de la frontière.
 */
export const MeeshyWavePlayer = memo(function MeeshyWavePlayer(props: MeeshyWavePlayerProps) {
  const { label, words, progress, isPlaying, onToggle, duration, size, phase = 'ready', clock, tint, caption, trailing, className } = props;
  if (label === '') throw new Error('MeeshyWavePlayer : le nom dit est obligatoire.');
  const [rootRef, width] = useWidth();
  const recipe = meeshyWavePlayerRecipe({ size, phase, isPlaying, progress, duration, clock, reduceMotion: prefersReducedMotion() });
  const verb = recipe.glyphKind === 'pause' ? words.pause : recipe.glyphKind === 'replay' ? words.replay : words.play;
  const state = phase === 'buffering' ? words.buffering : phase === 'unavailable' ? words.unavailable : '';
  const press = (): void => {
    if (!recipe.isActionable) return;
    impact('light');
    onToggle();
  };
  return (
    <div className={className === undefined ? 'kit-wave' : `kit-wave ${className}`} data-kit-wave-player="" data-size={recipe.size} data-phase={phase} data-playing={isPlaying ? '' : undefined} style={meeshyWavePlayerStyle(recipe, tint)}>
      <div className="kit-wave__row">
        <button type="button" className="kit-wave__disc" data-kit-wave-disc="" aria-label={`${verb}, ${label}`} aria-disabled={recipe.isActionable ? undefined : 'true'} onClick={press}>
          {GLYPHS[recipe.glyphKind]}
          {recipe.showsRing ? <span className="kit-wave__ring" aria-hidden="true" /> : null}
        </button>
        <div className="kit-wave__lane" ref={rootRef}>
          <Zone props={props} recipe={recipe} width={width} />
          {caption === undefined ? null : <span className="kit-wave__caption" data-kit-wave-caption="">{caption}</span>}
        </div>
        <span className="kit-wave__clock" data-kit-wave-clock="">
          {recipe.clockSeconds === null ? '–:––' : formatMediaTime(recipe.clockSeconds)}
        </span>
        {trailing === undefined || trailing === null ? null : <span className="kit-wave__trailing" data-kit-wave-trailing="">{trailing}</span>}
      </div>
      {state === '' ? null : <span className="sr-only" role="status">{state}</span>}
    </div>
  );
});
