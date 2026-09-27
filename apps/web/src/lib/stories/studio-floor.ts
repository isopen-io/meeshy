import { thumbHashImage } from '@/lib/media/thumbhash-image';

import type { StudioPage, StudioVisualAsset } from './studio-page';

/**
 * **LE SOL DE LA SCÈNE** (#8413, directive porteur 2026-09-27 : « la scène
 * doit avoir un sol peint en thumbhash du résultat de la scène ») — ce qui se
 * peint AUTOUR de la carte 9:16, entre la barre haute et le socle. Miroir de
 * `ComposerSceneSurface.sceneLetterbox` (iOS).
 *
 * L'ordre suit la justesse : le hash du COMPOSITE (ce que la publication
 * emportera) quand la scène en porte un ; le web ne sait pas encore le
 * calculer au composer (iOS rend la slide pour le hacher), donc à défaut le
 * hash du FOND, puis du CALQUE, dès que l'accusé de montée les porte ; avant
 * tout accusé, l'IMAGE locale du fond elle-même — floutée à la peinture, elle
 * est ce qu'un thumbhash étiré approche. Une page sans média n'a pas de sol :
 * la surface du thème reste, comme sur iOS.
 */
export type StudioFloor = { readonly kind: 'hash' | 'media'; readonly src: string };

const hashOf = (asset: StudioVisualAsset | null): string | undefined =>
  asset !== null && asset.upload.phase === 'ready' ? asset.upload.thumbHash : undefined;

export function studioFloor(params: { readonly page: StudioPage; readonly sceneHash?: string }): StudioFloor | null {
  const { page } = params;
  const hashed = [params.sceneHash, hashOf(page.background), hashOf(page.overlay)]
    .map((hash) => thumbHashImage(hash))
    .find((src): src is string => src !== undefined);
  if (hashed !== undefined) return { kind: 'hash', src: hashed };
  const image = [page.background, page.overlay].find((asset) => asset !== null && asset.mediaType === 'image');
  return image === undefined || image === null ? null : { kind: 'media', src: image.previewUrl };
}
