import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';

import { applyZoom, clampZoom, currentZoom, zoomAfterPinch, zoomAfterWheel, zoomLabel, zoomNudge, zoomRangeOf, type ZoomRange } from '@/lib/calls/camera-zoom';
import { cameraSourceOf } from '@/lib/calls/video-effects';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **MA CAMÉRA EN PLEIN ÉCRAN** (#8441, #8576) — quand MON image remplit
 * l'écran (un toucher sur ma vignette l'y met), et là seulement :
 *
 * - pincer mon image, ou la molette dessus, zoome la caméra, là où elle le
 *   propose (Chrome sur Android, la coque) ;
 * - le rail de ma caméra (Retourner, Couper la caméra, Effets, Partager
 *   l'écran — bâti par l'écran d'appel) se pose sur le bord, et la capsule
 *   `+  1×  −` du zoom s'y range dessous : elle le fait au clavier et au
 *   lecteur d'écran, et dit le facteur.
 *
 * Chunk à part (`budgets.json` › `call_self_camera`), chargé quand mon image
 * passe en plein écran : il n'importe rien de l'écran d'appel (`call_overlay`),
 * qui lui remet ses glyphes et la colonne du rail (`column`).
 */

export type CameraZoom = { readonly range: ZoomRange; readonly value: number; readonly set: (value: number) => void };

/** Le zoom de la caméra DERRIÈRE ma piste envoyée — `null` quand elle n'en propose pas. */
export function useCameraZoom(stream: MediaStream | null): CameraZoom | null {
  const sent = stream?.getVideoTracks()[0] ?? null;
  const camera = sent === null ? null : cameraSourceOf(sent);
  const range = useMemo(() => zoomRangeOf(camera), [camera]);
  const [value, setValue] = useState(() => (camera !== null && range !== null ? currentZoom(camera, range) : 1));
  useEffect(() => {
    if (camera !== null && range !== null) setValue(currentZoom(camera, range));
  }, [camera, range]);
  if (camera === null || range === null) return null;
  return {
    range,
    value,
    set: (next) => {
      const zoom = clampZoom(range, next);
      setValue(zoom);
      void applyZoom(camera, zoom).catch(() => undefined);
    },
  };
}

type Point = { readonly x: number; readonly y: number };

const gap = (points: readonly Point[]): number => {
  const [a, b] = points;
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
};

export type ZoomGestures = {
  readonly onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp?: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel?: (event: PointerEvent<HTMLElement>) => void;
  readonly onWheel?: (event: WheelEvent<HTMLElement>) => void;
  readonly onClickCapture?: (event: MouseEvent<HTMLElement>) => void;
  readonly style?: CSSProperties;
};

/** Pincer et molette sur mon image. Un pincement n'est jamais un toucher : le clic qui le suit est avalé. */
export function useZoomGestures(zoom: CameraZoom | null): ZoomGestures {
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ readonly distance: number; readonly start: number } | null>(null);
  const pinched = useRef(false);
  if (zoom === null) return {};
  const release = (event: PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  return {
    onPointerDown: (event) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size !== 2) return;
      pinch.current = { distance: gap([...pointers.current.values()]), start: zoom.value };
      pinched.current = true;
    },
    onPointerMove: (event) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = pinch.current;
      if (start === null || start.distance === 0) return;
      zoom.set(zoomAfterPinch(zoom.range, start.start, gap([...pointers.current.values()]) / start.distance));
    },
    onPointerUp: release,
    onPointerCancel: release,
    onWheel: (event) => zoom.set(zoomAfterWheel(zoom.range, zoom.value, event.deltaY)),
    onClickCapture: (event) => {
      if (!pinched.current) return;
      pinched.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    style: { touchAction: 'none' },
  };
}

type Glyphs = { readonly plus: ReactNode; readonly minus: ReactNode };

const STEP = 'grid size-11 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40 motion-reduce:transition-none';

/** La capsule `+  1×  −`, debout sous le rail. */
function ZoomCapsule({ zoom, language, glyphs }: { readonly zoom: CameraZoom; readonly language: InterfaceLanguage; readonly glyphs: Glyphs }) {
  const step = (direction: 1 | -1) => () => zoom.set(zoomNudge(zoom.range, zoom.value, direction));
  return (
    <div role="group" aria-label={translate(language, 'call.zoom')} className="glass-call flex flex-col items-center rounded-full p-0.5 text-white" data-call-zoom="">
      <button type="button" aria-label={translate(language, 'call.zoom.in')} title={translate(language, 'call.zoom.in')} onClick={step(1)} disabled={zoom.value >= zoom.range.max} className={STEP} data-call-zoom-in="">
        {glyphs.plus}
      </button>
      <span role="status" aria-live="polite" className="min-w-9 py-0.5 text-center text-mini font-semibold tabular-nums" data-call-zoom-value="">
        {zoomLabel(zoom.value, language)}
      </span>
      <button type="button" aria-label={translate(language, 'call.zoom.out')} title={translate(language, 'call.zoom.out')} onClick={step(-1)} disabled={zoom.value <= zoom.range.min} className={STEP} data-call-zoom-out="">
        {glyphs.minus}
      </button>
    </div>
  );
}

type SelfCameraProps = {
  readonly stream: MediaStream | null;
  readonly language: InterfaceLanguage;
  readonly glyphs: Glyphs;
  /** La colonne du rail, qui accueille la capsule — `null` quand les commandes de ma caméra sont retirées (un mode). */
  readonly column: ((capsule: ReactNode) => ReactNode) | null;
};

export function CallSelfCamera({ stream, language, glyphs, column }: SelfCameraProps) {
  const zoom = useCameraZoom(stream);
  const gestures = useZoomGestures(zoom);
  return (
    <>
      {zoom === null ? null : <div aria-hidden className="absolute inset-0" {...gestures} data-call-self-gestures="" />}
      {column === null ? null : column(zoom === null ? null : <ZoomCapsule zoom={zoom} language={language} glyphs={glyphs} />)}
    </>
  );
}
