import { findMeeSticker } from './catalog';
import { renderMeeSticker } from './render';

/**
 * LE DESSIN DE L'ATTENTE D'UN ÉCRAN (#10635) — Mee et Meo qui dansent, le
 * sticker `duo-on-danse` rendu par le moteur Mee, mais DÉCORATIF : le libellé
 * accessible vit sur le conteneur, dans la langue de l'interface, jamais le
 * titre français du catalogue.
 *
 * Cette fonction ne sert qu'au script de génération et à son témoin : l'attente
 * s'affiche AVANT le chunk d'un écran, elle ne peut donc charger ni le
 * catalogue ni le moteur. Elle lit le texte FIGÉ de
 * `components/screen-wait-art.ts`, que `scripts/generate-screen-wait-art.ts`
 * réécrit et que `screen-wait.test.tsx` compare à cette source.
 */
export function screenWaitArtSource(): string {
  const sticker = findMeeSticker('duo-on-danse');
  if (sticker === undefined) throw new Error('sticker duo-on-danse absent du catalogue Mee');
  return renderMeeSticker(sticker, { uid: 'screen-wait' }).replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');
}
