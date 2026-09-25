import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { sceneSeekStep } from '@/lib/canvas/media-seek';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { formatMediaTime, keyboardSeekTarget, seekFraction } from '@/lib/view/media-transport';
import { CLAIMS_GESTURE_ATTRIBUTE } from '@/lib/view/shortcut-scope';

import '@/styles/scene-scrub.css';

/** Peint la progression, en fraction [0, 1] — l'UNIQUE écriture du visuel,
 * hors de React. L'hôte l'appelle depuis son horloge ; la barre, depuis le doigt. */
export type SceneScrubPainter = (fraction: number) => void;

export type SceneScrubBarProps = {
  readonly durationSeconds: number;
  readonly language: InterfaceLanguage;
  /** Où la piste fine vit dans sa zone de frappe de 44 px : collée au BAS
   * (le réel, au ras de la page) ou au CENTRE (le segment de story). */
  readonly align: 'bottom' | 'center';
  /** Le fond CSS du rempli — l'accent du réel, le dégradé de la story. */
  readonly fill: string;
  /** Le fond CSS de la piste — blanc 30 % par défaut ; la story garde le
   * blanc 20 % de ses autres segments. */
  readonly rail?: string;
  readonly painterRef: { current: SceneScrubPainter | null };
  /** Le doigt se pose : l'hôte suspend la lecture (et l'avance de story). */
  readonly onScrubStart: () => void;
  /** Un temps pointé, en secondes — l'hôte y redessine la scène (`seek`). */
  readonly onScrub: (seconds: number) => void;
  /** Le doigt se lève (ou le système reprend le pointeur) : reprise DEPUIS ce temps. */
  readonly onScrubEnd: (seconds: number) => void;
  /** Le placement de la ZONE de frappe chez l'hôte. */
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Des prises de mesure posées sur le rempli (`data-reel-progress`). */
  readonly fillAttributes?: Readonly<Record<`data-${string}`, string>>;
};

const clampFraction = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * LA BARRE QU'ON PARCOURT AU DOIGT (#7879) — même geste que la piste de la
 * visionneuse (`media-transport.tsx`, dont elle réutilise `seekFraction` et
 * `keyboardSeekTarget`) et que `ReelScrubBar` d'iOS : la barre fine (3 px)
 * S'AGRANDIT sous le doigt (10 px) et montre sa poignée ; glisser pointe le
 * temps, et l'hôte redessine la scène à chaque mouvement par l'horloge
 * (`SceneClockHandle.seek`) — aucun état React par trame.
 *
 * La zone de frappe fait 44 px ; les commandes que l'hôte peint APRÈS elle
 * (rail des réels, identité de story) la recouvrent et gardent leur geste.
 * `data-claims-gesture` fait céder le lecteur de story (tap, appui, swipe) ;
 * `touch-action: none` fait céder le défilement du pager des réels.
 */
export function SceneScrubBar({
  durationSeconds,
  language,
  align,
  fill,
  rail,
  painterRef,
  onScrubStart,
  onScrub,
  onScrubEnd,
  className,
  style,
  fillAttributes,
}: SceneScrubBarProps) {
  const [scrubbing, setScrubbing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const fractionRef = useRef(0);
  const draggingRef = useRef(false);
  const durationRef = useRef(durationSeconds);
  durationRef.current = durationSeconds;
  const languageRef = useRef(language);
  languageRef.current = language;

  useLayoutEffect(() => {
    const paint: SceneScrubPainter = (value) => {
      const fraction = clampFraction(value);
      fractionRef.current = fraction;
      const fillEl = fillRef.current;
      if (fillEl !== null) fillEl.style.transform = `scaleX(${fraction})`;
      const thumbEl = thumbRef.current;
      if (thumbEl !== null) thumbEl.style.left = `${fraction * 100}%`;
      const rootEl = rootRef.current;
      if (rootEl === null) return;
      const percent = String(Math.round(fraction * 100));
      if (rootEl.getAttribute('aria-valuenow') === percent) return;
      rootEl.setAttribute('aria-valuenow', percent);
      const total = durationRef.current;
      rootEl.setAttribute(
        'aria-valuetext',
        translate(languageRef.current, 'media.video.position.value', { elapsed: formatMediaTime(fraction * total), total: formatMediaTime(total) }),
      );
    };
    painterRef.current = paint;
    return () => {
      if (painterRef.current === paint) painterRef.current = null;
    };
  }, [painterRef]);

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = seekFraction({ clientX: event.clientX, left: rect.left, width: rect.width });
    painterRef.current?.(fraction);
    const seconds = fraction * durationRef.current;
    onScrub(seconds);
    return seconds;
  };

  const finish = (): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setScrubbing(false);
    onScrubEnd(fractionRef.current * durationRef.current);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    draggingRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Un pointeur synthétique n'a pas toujours de capture ; le geste reste suivi par la zone.
    }
    setScrubbing(true);
    onScrubStart();
    pointAt(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    event.stopPropagation();
    pointAt(event);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    event.stopPropagation();
    pointAt(event);
    finish();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const duration = durationRef.current;
    const target = keyboardSeekTarget({ key: event.key, position: fractionRef.current * duration, duration, step: sceneSeekStep(duration) });
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    painterRef.current?.(target / duration);
    onScrub(target);
  };

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={0}
      aria-label={translate(language, 'media.video.position')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-valuetext={translate(language, 'media.video.position.value', { elapsed: formatMediaTime(0), total: formatMediaTime(durationSeconds) })}
      data-scene-scrub
      data-align={align}
      {...{ [CLAIMS_GESTURE_ATTRIBUTE]: '' }}
      {...(scrubbing ? { 'data-scrubbing': '' } : {})}
      className={`scene-scrub ${className ?? ''}`.trim()}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <span className="scene-scrub-rail" aria-hidden="true" {...(rail !== undefined ? { style: { background: rail } } : {})} />
      <span
        ref={fillRef}
        className="scene-scrub-fill"
        aria-hidden="true"
        data-scene-scrub-fill
        {...fillAttributes}
        style={{ background: fill, transform: 'scaleX(0)' }}
      />
      <span ref={thumbRef} className="scene-scrub-thumb" aria-hidden="true" data-scene-scrub-thumb style={{ left: '0%' }} />
    </div>
  );
}
