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
 *
 * La scène est DÉCOUPÉE comme un sticker imprimé : un contour blanc épais
 * épouse tout ce qui est dessiné — personnages, accessoires, bandeau — et une
 * ombre douce le pose sur le fond. Le contour vient d'un filtre et non d'un
 * trait par forme : un accessoire ajouté au catalogue le reçoit sans y penser.
 * Ce qui est presque transparent (l'ombre au sol) reste hors de la découpe.
 * La boîte de vue déborde de la scène de 200 × 200 de quoi loger le contour.
 */
export function renderMeeSticker(sticker: MeeSticker, o: { readonly uid?: string; readonly slots?: MeeSlots; readonly animated?: boolean; readonly size?: number } = {}): string {
  const uid = (o.uid ?? sticker.id).replace(/[^a-zA-Z0-9-]/g, '');
  const root = `mee-s-${uid}`;
  const animated = o.animated !== false && sticker.motion !== null;
  const style = animated && sticker.motion !== null ? `<style>${motionCss(root, sticker.motion)}</style>` : '';
  const scene = sticker.scene(`g${uid}`, meeSlotsFor(sticker, o.slots ?? {}));
  const size = o.size !== undefined ? String(o.size) : '100%';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MEE_VIEWBOX}" width="${size}" height="${size}" class="mee-sticker ${root}" role="img" aria-label="${escapeSvg(sticker.title)}">${dieCut(`${root}-cut`)}<g filter="url(#${root}-cut)">${scene}</g>${style}</svg>`;
}

export const MEE_VIEWBOX = '-8 -8 216 216';

function dieCut(id: string): string {
  return `<defs><filter id="${id}" filterUnits="userSpaceOnUse" x="-8" y="-8" width="216" height="216" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="grown"/><feGaussianBlur in="grown" stdDeviation="1.6" result="soft"/><feComponentTransfer in="soft" result="cut"><feFuncA type="linear" slope="5" intercept="-0.9"/></feComponentTransfer><feFlood flood-color="#ffffff"/><feComposite in2="cut" operator="in" result="paper"/><feGaussianBlur in="cut" stdDeviation="2.4" result="haze"/><feOffset in="haze" dy="2.2" result="drop"/><feFlood flood-color="#1c1941" flood-opacity=".26"/><feComposite in2="drop" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="paper"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
}
