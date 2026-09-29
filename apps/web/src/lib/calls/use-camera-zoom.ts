import { useEffect, useMemo, useState } from 'react';

import { applyZoom, clampZoom, currentZoom, LOCAL_ZOOM_RANGE, zoomRangeOf, type ZoomRange } from './camera-zoom';
import type { LocalZoom } from './self-zoom';
import { cameraSourceOf } from './video-effects';

/**
 * **LE ZOOM DE MA CAMÉRA, SUR LES DEUX CAPTEURS** (#8441) — la capsule du
 * plein écran et le cran de ma vignette (`call-self-camera.tsx`) :
 *
 * - `device` : la caméra DERRIÈRE ma piste envoyée propose `zoom` — le zoom
 *   de l'appareil (optique, puis numérique), et c'est ce que l'autre voit ;
 * - `local` : elle n'en propose pas — mon seul aperçu s'agrandit
 *   (`self-zoom.ts`, remis par l'écran d'appel), rien ne change dans ce qui
 *   part.
 *
 * `null` : caméra coupée.
 */

export type ZoomMode = 'device' | 'local';

export type CameraZoom = { readonly mode: ZoomMode; readonly range: ZoomRange; readonly value: number; readonly set: (value: number) => void };

type ZoomSource = { readonly stream: MediaStream | null; readonly local: LocalZoom };

export function useCameraZoom({ stream, local }: ZoomSource): CameraZoom | null {
  const sent = stream?.getVideoTracks()[0] ?? null;
  const camera = sent === null ? null : cameraSourceOf(sent);
  const range = useMemo(() => zoomRangeOf(camera), [camera]);
  const [value, setValue] = useState(() => (camera !== null && range !== null ? currentZoom(camera, range) : 1));
  useEffect(() => {
    if (camera !== null && range !== null) setValue(currentZoom(camera, range));
  }, [camera, range]);
  if (camera === null) return null;
  if (range === null) return { mode: 'local', range: LOCAL_ZOOM_RANGE, value: local.value, set: (next) => local.set(clampZoom(LOCAL_ZOOM_RANGE, next)) };
  return {
    mode: 'device',
    range,
    value,
    set: (next) => {
      const zoom = clampZoom(range, next);
      setValue(zoom);
      void applyZoom(camera, zoom).catch(() => undefined);
    },
  };
}
