import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import type { Facing } from './call-media';
import { applyZoom, clampZoom, currentZoom, LOCAL_ZOOM_RANGE, zoomRangeOf, type ZoomRange } from './camera-zoom';
import { localZoomFor, selfZoomStore, setLocalZoom } from './self-zoom';
import { cameraSourceOf } from './video-effects';

/**
 * **LE ZOOM DE MA CAMÉRA, SUR LES DEUX CAPTEURS** (#8441) — partagé par la
 * capsule du plein écran (`call-self-camera.tsx`) et le cran de ma vignette
 * (`call-control-actions.tsx`) :
 *
 * - `device` : la caméra DERRIÈRE ma piste envoyée propose `zoom` — le zoom
 *   de l'appareil (optique, puis numérique), et c'est ce que l'autre voit ;
 * - `local` : elle n'en propose pas — mon seul aperçu s'agrandit
 *   (`self-zoom.ts`), rien ne change dans ce qui part.
 *
 * `null` : caméra coupée.
 */

export type ZoomMode = 'device' | 'local';

export type CameraZoom = { readonly mode: ZoomMode; readonly range: ZoomRange; readonly value: number; readonly set: (value: number) => void };

type ZoomSource = { readonly stream: MediaStream | null; readonly callId: string | null; readonly facing: Facing };

export function useCameraZoom({ stream, callId, facing }: ZoomSource): CameraZoom | null {
  const sent = stream?.getVideoTracks()[0] ?? null;
  const camera = sent === null ? null : cameraSourceOf(sent);
  const range = useMemo(() => zoomRangeOf(camera), [camera]);
  const [value, setValue] = useState(() => (camera !== null && range !== null ? currentZoom(camera, range) : 1));
  const local = useStore(selfZoomStore, (state) => localZoomFor(state, callId ?? '', facing));
  useEffect(() => {
    if (camera !== null && range !== null) setValue(currentZoom(camera, range));
  }, [camera, range]);
  if (camera === null) return null;
  if (range === null) return { mode: 'local', range: LOCAL_ZOOM_RANGE, value: local, set: (next) => setLocalZoom(callId ?? '', facing, clampZoom(LOCAL_ZOOM_RANGE, next)) };
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
