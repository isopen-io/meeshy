import { findMeeSticker } from '../lib/mee/catalog';
import { renderMeeSticker } from '../lib/mee/render';
import type { ContentPage, MeeView } from './type';

/**
 * LES VUES DE MEE SONT DES FICHIERS, PAS DU MARKUP EN LIGNE (#9034).
 *
 * Une scène de Mee pèse ~1,2 Ko gzip. En ligne dans le document, elle
 * faisait passer `/privacy` de 10 à 11,2 Ko et `/about` (cinq scènes) à
 * 13,9 Ko — au-dessus du plafond `institutional_page.kb`. Servie en
 * `<img src="/mee/<id>.svg">`, elle coûte une requête la PREMIÈRE fois,
 * puis rien : le service worker précache le fichier comme tout `*.svg` du
 * dist. Le SVG porte son animation (une balise `<style>` sous
 * `prefers-reduced-motion`), que le navigateur joue aussi dans une image.
 */

export const meeViewSrc = (view: MeeView): string => `/mee/${view.sticker}.svg`;

const viewsOf = (page: ContentPage): readonly MeeView[] => [
  ...(page.mee !== undefined ? [page.mee] : []),
  ...page.sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === 'mee' ? block.views : []))),
];

/** Les fichiers à écrire dans le dist pour ces pages — un par sticker, chemin relatif au dist. */
export function meeViewFiles(pages: readonly ContentPage[]): readonly { readonly path: string; readonly svg: string }[] {
  const ids = [...new Set(pages.flatMap(viewsOf).map((view) => view.sticker))];
  return ids.map((id) => {
    const sticker = findMeeSticker(id);
    if (sticker === undefined) throw new Error(`Sticker Mee inconnu dans une page institutionnelle : ${id}`);
    return { path: `mee/${id}.svg`, svg: renderMeeSticker(sticker, { uid: 'v', size: 200 }) };
  });
}
