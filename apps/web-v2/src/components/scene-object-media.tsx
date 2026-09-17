import { useEffect, useRef, useState } from 'react';

import { mediaCropStyle, readMediaCrop } from '@meeshy/shared/utils/media-crop';

import { objectMediaIdentity, objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';
import { MEDIA_CORNER_FRACTION, placedMediaDesignSize } from '@/lib/canvas/media-size';
import { cqw } from '@/lib/canvas/units';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

const DESIGN_WIDTH = 1080;

/** Un média posé (`content`/`fg`, non-fond) — au-dessus du fond, jamais son
 * remplaçant. Taille au rapport EFFECTIF (`placedMediaDesignSize`), jamais
 * `60%` fixe (D7, revue-correction #6898). */
export function SceneObjectMedia({
  object,
  carrier,
  playing,
  muted,
  clock,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly clock: SceneClockHandle | null;
}) {
  const src = objectMediaSrc(object, carrier);
  const [errored, setErrored] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  if (src === undefined) return null;
  const { payload } = object;
  const identity = objectMediaIdentity(object);
  const carried = identity === null ? undefined : carrier.media.find((m) => m.id === identity);
  const poster = carried?.poster;
  const declaredAspect = typeof payload.aspectRatio === 'number' && payload.aspectRatio > 0 ? payload.aspectRatio : undefined;
  const aspectRatio = declaredAspect ?? (carried?.width !== undefined && carried?.height !== undefined && carried.height > 0 ? carried.width / carried.height : 1);
  const scale = typeof payload.scale === 'number' && payload.scale > 0 ? payload.scale : 1;
  const crop = readMediaCrop(payload);
  const size = placedMediaDesignSize({ aspectRatio, scale, crop });
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : undefined;
  const isVideo = mediaType?.startsWith('video') === true;
  const loop = payload.loop === true;

  useEffect(() => {
    const el = videoRef.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    void el.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, src]);

  const boxStyle = {
    width: cqw(size.width / DESIGN_WIDTH),
    height: cqw(size.height / DESIGN_WIDTH),
    borderRadius: cqw((MEDIA_CORNER_FRACTION * Math.min(size.width, size.height)) / DESIGN_WIDTH),
    overflow: 'hidden' as const,
  };
  const innerStyle = crop !== null ? { ...mediaCropStyle(crop), position: 'absolute' as const, objectFit: 'fill' as const } : {};

  // `hidden={errored}` sur l'élément lui-même (miroir `GridCellImage`,
  // `media-grid.tsx:322-328`) — jamais un `return null` du composant ENTIER :
  // le cadre vide ne peint pas une boîte grise (T-E3), mais la POSE et
  // l'horloge de l'objet restent posées si un keyframe le concerne encore.
  return (
    <SceneObjectFrame object={object} kind="media" clock={clock} className="[&>*]:pointer-events-none">
      <span className="relative block" style={boxStyle}>
        {isVideo ? (
          <video
            ref={videoRef}
            src={src}
            muted={muted}
            loop={loop}
            playsInline
            preload="none"
            hidden={errored}
            {...(poster !== undefined ? { poster } : {})}
            className="size-full object-cover"
            style={crop !== null ? innerStyle : undefined}
            onError={() => setErrored(true)}
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            hidden={errored}
            className="size-full object-cover"
            style={crop !== null ? innerStyle : undefined}
            onError={() => setErrored(true)}
          />
        )}
      </span>
    </SceneObjectFrame>
  );
}
