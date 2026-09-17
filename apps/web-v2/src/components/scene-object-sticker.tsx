import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';
import { stickerGlyph, stickerWidthFraction } from '@/lib/canvas/sticker';
import { cqw } from '@/lib/canvas/units';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

/**
 * Un STICKER — `emoji` en priorité, sinon un repli générique (`stickerGlyph`,
 * jamais rejeté). Le MOUVEMENT (`payload.animation`) n'est PAS rendu —
 * décoration FIXE, décision « propriété, pas kind »
 * (`meeshy-composer-modele.md:82-124`, #4911, § 9 Q9).
 */
export function SceneObjectSticker({
  object,
  carrier,
  clock,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly clock: SceneClockHandle | null;
}) {
  const { payload } = object;
  const glyph = stickerGlyph(payload);
  if (glyph === null) return null;
  const baseSize = typeof payload.baseSize === 'number' ? payload.baseSize : undefined;
  const scale = object.transform.scale;
  const fontSize = cqw(stickerWidthFraction(baseSize, scale));
  const emoji = typeof payload.emoji === 'string' && payload.emoji !== '' ? payload.emoji : undefined;
  const imageSrc = emoji === undefined ? objectMediaSrc(object, carrier) : undefined;

  return (
    <SceneObjectFrame object={object} kind="sticker" clock={clock}>
      {imageSrc !== undefined ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={imageSrc} alt="" aria-hidden="true" style={{ width: '1em', height: '1em', fontSize }} />
      ) : (
        <span role="img" aria-label={glyph} style={{ fontSize, lineHeight: 1 }}>
          {glyph}
        </span>
      )}
    </SceneObjectFrame>
  );
}
