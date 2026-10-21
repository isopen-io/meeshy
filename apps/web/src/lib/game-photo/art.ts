import { prepareSvgMarkup } from './compose';
import type { PhotoArt } from './compose';

/**
 * LES DESSINS DU CADRE (#9382) — l'image finale reprend les SVG que l'écran
 * vient de peindre (emblème, Mee, Meo, Signature) : « le cadre est le même
 * dessin partout », sans second jeu de dessins à tenir. Le cadre porte un
 * `data-photo-art` par emplacement ; on y lit le SVG, on résout ses jetons CSS
 * (`css-vars.ts`) et on le rasterise.
 *
 * Tout ou rien : un emplacement absent ou un dessin qui ne se rasterise pas
 * rend `null` — une photo composée sans Mee, ou sans emblème, serait pire que
 * pas de photo, parce qu'elle aurait l'air finie.
 */

export const ART_SLOTS = ['emblem', 'mee', 'meo', 'signature'] as const;
export type ArtSlot = (typeof ART_SLOTS)[number];
/** La Flamme du bandeau de parrainage (#7742) : un dessin FACULTATIF — son absence ou son échec ne défait pas la carte. */
const FLAME_SLOT = 'flame';
/** La plaque d'auteur (#10816) : FACULTATIVE aussi — un invité ou un moment sans plaque n'en porte pas. */
const AUTHOR_SLOT = 'author';
export type ArtMarkup = Readonly<Record<ArtSlot, string>> & { readonly flame?: string; readonly author?: string };

/** Les tailles de rastérisation (côté le plus large) : deux fois ce que la plus grande mise en page demande. */
const SIZES: Readonly<Record<ArtSlot, number>> = { emblem: 768, mee: 512, meo: 512, signature: 256 };
const FLAME_SIZE = 256;
/** Le cartouche est large (360 × 100) : la plus grande mise en page le pose sur 756 px. */
const AUTHOR_SIZE = 1440;

export function collectArtMarkup(root: ParentNode): ArtMarkup | null {
  const found: Partial<Record<ArtSlot, string>> = {};
  for (const slot of ART_SLOTS) {
    const svg = root.querySelector(`[data-photo-art="${slot}"] svg`);
    if (svg === null) return null;
    found[slot] = svg.outerHTML;
  }
  const flame = root.querySelector(`[data-photo-art="${FLAME_SLOT}"] svg`);
  const author = root.querySelector(`[data-photo-art="${AUTHOR_SLOT}"] svg`);
  return { ...(found as Record<ArtSlot, string>), ...(flame === null ? {} : { flame: flame.outerHTML }), ...(author === null ? {} : { author: author.outerHTML }) };
}

export async function loadArt(params: {
  readonly root: ParentNode;
  readonly read: (name: string) => string;
  readonly raster: (markup: string) => Promise<HTMLImageElement | null>;
}): Promise<PhotoArt | null> {
  const markup = collectArtMarkup(params.root);
  if (markup === null) return null;
  const images = await Promise.all(
    ART_SLOTS.map((slot) =>
      params.raster(prepareSvgMarkup(markup[slot], { size: SIZES[slot], read: params.read }).markup),
    ),
  );
  const [emblem, mee, meo, signature] = images;
  if (!(emblem && mee && meo && signature)) return null;
  const optional = (svg: string | undefined, size: number) => (svg === undefined ? Promise.resolve(null) : params.raster(prepareSvgMarkup(svg, { size, read: params.read }).markup));
  const [flame, author] = await Promise.all([optional(markup.flame, FLAME_SIZE), optional(markup.author, AUTHOR_SIZE)]);
  return { emblem, mee, meo, signature, ...(flame === null ? {} : { flame }), ...(author === null ? {} : { author }) };
}
