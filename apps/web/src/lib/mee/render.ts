import { escapeSvg } from './art';
import { meeSlotsFor } from './catalog';
import { motionCss } from './motion';
import type { MeeSlots, MeeSticker } from './types';

/**
 * LE SVG D'UN STICKER MEE (#9034) — autonome : il porte son CSS d'animation
 * dans sa balise `<style>`, ciblé par sa classe racine, si bien qu'il s'anime
 * pareil dans une bulle, dans la feuille ou dans une page statique sans
 * script. La balise `<style>` ferme le SVG plutôt que de l'ouvrir : le
 * navigateur l'applique où qu'elle soit, et happy-dom (les tests) avale tout
 * ce qui la SUIT dans un `<svg>`. `uid` doit être unique dans le document hôte : il préfixe les
 * dégradés et la classe racine.
 */
export function renderMeeSticker(sticker: MeeSticker, o: { readonly uid?: string; readonly slots?: MeeSlots; readonly animated?: boolean; readonly size?: number } = {}): string {
  const uid = (o.uid ?? sticker.id).replace(/[^a-zA-Z0-9-]/g, '');
  const root = `mee-s-${uid}`;
  const animated = o.animated !== false && sticker.motion !== null;
  const style = animated && sticker.motion !== null ? `<style>${motionCss(root, sticker.motion)}</style>` : '';
  const scene = sticker.scene(`g${uid}`, meeSlotsFor(sticker, o.slots ?? {}));
  const size = o.size !== undefined ? String(o.size) : '100%';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" class="mee-sticker ${root}" role="img" aria-label="${escapeSvg(sticker.title)}">${scene}${style}</svg>`;
}
