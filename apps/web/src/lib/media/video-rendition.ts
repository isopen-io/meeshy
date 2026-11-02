import type { MediaRendition } from '@meeshy/shared/types/attachment';

import type { DeviceTier } from '@/lib/device/capability-tier';

/**
 * **LA VIDÉO SERVIE AU WEB** (W12, #11318) — PURE.
 *
 * Une vidéo HEVC envoyée depuis un iPhone porte, à côté de son original, un
 * rendu H.264 ≤ 1080p de compatibilité (`renditions[codec = 'h264']`, S6
 * #11261), mappé en SDR BT.709. L'original reste la meilleure image (HDR,
 * définition pleine) ; le rendu, la plus compatible et la moins coûteuse à
 * décoder. La loi tranche :
 * - aucun rendu H.264 ⇒ l'original (toute vidéo d'avant S6, tout ce qui n'est
 *   pas HEVC, l'aperçu local `blob:` d'un envoi) ;
 * - le navigateur ne décode pas le HEVC ⇒ le rendu, quel que soit le tier ;
 * - tier `low` ⇒ le rendu (décodage plus léger, fichier borné à 1080p) ;
 * - tier `mid` (réseau 3G, données économisées) ⇒ le plus léger des deux ;
 * - tier `high` / `pro` ⇒ l'original, que le navigateur sait lire.
 *
 * Le tier est celui de W10 (`capability-tier.ts`), jamais un seuil réinventé.
 */
export type VideoSourceInputs = {
  readonly fileUrl: string;
  readonly fileSize?: number | undefined;
  readonly renditions?: readonly MediaRendition[] | undefined;
  readonly decodesHevc: boolean;
  readonly tier: DeviceTier;
};

export type VideoSourceChoice = { readonly url: string; readonly rendition: 'original' | 'h264' };

/** Le rendu H.264 utilisable d'une pièce, ou `undefined`. */
export function compatibilityRendition(renditions: unknown): MediaRendition | undefined {
  if (!Array.isArray(renditions)) return undefined;
  return (renditions as readonly MediaRendition[]).find(
    (rendition) => rendition?.codec === 'h264' && typeof rendition.url === 'string' && rendition.url !== '',
  );
}

const lighterThanOriginal = (rendition: MediaRendition, fileSize: number | undefined): boolean =>
  fileSize !== undefined && Number.isFinite(rendition.size) && rendition.size < fileSize;

function prefersRendition(inputs: VideoSourceInputs, rendition: MediaRendition): boolean {
  if (!inputs.decodesHevc) return true;
  if (inputs.tier === 'low') return true;
  if (inputs.tier === 'mid') return lighterThanOriginal(rendition, inputs.fileSize);
  return false;
}

export function electVideoSource(inputs: VideoSourceInputs): VideoSourceChoice {
  const rendition = compatibilityRendition(inputs.renditions);
  if (rendition === undefined || !prefersRendition(inputs, rendition)) return { url: inputs.fileUrl, rendition: 'original' };
  return { url: rendition.url, rendition: 'h264' };
}
