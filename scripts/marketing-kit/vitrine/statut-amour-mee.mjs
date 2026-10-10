// Mee et Meo de la vidéo de statut (#9988), dessinés par leur SOURCE UNIQUE : apps/web/src/lib/mee (des SVG animés en
// CSS). Aucun dessin n'est refait ici : la page pose chaque sticker en vectoriel, à la taille du rendu, et fige ses
// animations à l'instant de l'image (`getAnimations()`), comme apps/web/scripts/mee-ios-stickers.ts les filme pour iOS.
// Ce module importe du TypeScript : il ne tourne que sous bun (`bun scripts/marketing-kit/vitrine/statut-amour.mjs`).
import { MEE_STICKERS } from '../../../apps/web/src/lib/mee/catalog'
import { renderMeeSticker } from '../../../apps/web/src/lib/mee/render'

export const stickerDuCatalogue = (id) => {
  const sticker = MEE_STICKERS.find((s) => s.id === id)
  if (!sticker) throw new Error(`sticker Mee inconnu : ${id}`)
  return sticker
}

// Un SVG par APPARITION : le même sticker peut paraître deux fois, ses identifiants (dégradés, classe racine) diffèrent.
export const svgDesApparitions = (apparitions) => Object.fromEntries(apparitions.map(({ id, sticker }) => [id, renderMeeSticker(stickerDuCatalogue(sticker), { uid: `sa-${id}` })]))
