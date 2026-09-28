import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { applyZoom, clampZoom, currentZoom, zoomAfterPinch, zoomAfterWheel, zoomLabel, zoomNudge, zoomRangeOf, type ZoomRange } from '@/lib/calls/camera-zoom';
import { cameraSourceOf } from '@/lib/calls/video-effects';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE ZOOM DE MA CAMÉRA, À L'ÉCRAN** (#8441) — là où la caméra le propose
 * (Chrome sur Android, la coque) : pincer ma propre image, ou la molette
 * dessus, zoome ; une capsule de verre `−  1×  +` le fait au clavier et au
 * lecteur d'écran, et dit le facteur. Sans zoom proposé, rien n'est affiché.
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

/**
 * Pincer et molette sur ma propre image. Un pincement n'est jamais un toucher :
 * le clic qui le suit (la vignette s'inverse au toucher) est avalé.
 */
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

/** La capsule `−  1×  +` — un verre isolé, posé sur la scène près de mon image. */
export function CallZoomControl({ zoom, language, className, style }: { readonly zoom: CameraZoom; readonly language: InterfaceLanguage; readonly className?: string; readonly style?: CSSProperties }) {
  return (
    <div role="group" aria-label={translate(language, 'call.zoom')} className={`glass-call flex items-center rounded-full ${className ?? ''}`} style={style} data-call-zoom="">
      <CallButton label={translate(language, 'call.zoom.out')} glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.minus} size={18} />} onPress={() => zoom.set(zoomNudge(zoom.range, zoom.value, -1))} disabled={zoom.value <= zoom.range.min} size={44} data={{ 'data-call-zoom-out': '' }} />
      <span role="status" aria-live="polite" className="min-w-9 text-center text-mini font-semibold tabular-nums" data-call-zoom-value="">
        {zoomLabel(zoom.value, language)}
      </span>
      <CallButton label={translate(language, 'call.zoom.in')} glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.plus} size={18} />} onPress={() => zoom.set(zoomNudge(zoom.range, zoom.value, 1))} disabled={zoom.value >= zoom.range.max} size={44} data={{ 'data-call-zoom-in': '' }} />
    </div>
  );
}
