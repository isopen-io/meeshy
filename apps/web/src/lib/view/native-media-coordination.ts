import { mediaCoordinator, type MediaCoordinator } from './media-coordinator';

/**
 * UN LECTEUR AUX CONTRÔLES NATIFS ENTRE AU COORDINATEUR (#9575) — le `<video
 * controls>` d'un commentaire ou d'un aperçu du plateau n'a pas de bouton à
 * nous : c'est le navigateur qui le lance. Sans ce relais, il jouait
 * par-dessus la tuile, la visionneuse ou un vocal, et rien ne l'arrêtait.
 *
 * Se pose en `ref` (`ref={coordinateNativeMedia}`) : une fonction de module,
 * donc stable d'un rendu à l'autre. Rien à défaire au démontage — un élément
 * retiré du document est mis en pause par le navigateur, et cette pause rend
 * l'exclusivité.
 */
const coordinated = new WeakSet<HTMLMediaElement>();
const nativeKeys = { next: 0 };

export function coordinateNativeMedia(element: HTMLMediaElement | null, coordinator: MediaCoordinator = mediaCoordinator): void {
  if (element === null || coordinated.has(element)) return;
  coordinated.add(element);
  nativeKeys.next += 1;
  const key = `native#${nativeKeys.next}`;
  const claim = (): void => coordinator.claim(key, () => element.pause());
  const release = (): void => coordinator.release(key);
  element.addEventListener('play', claim);
  element.addEventListener('enterpictureinpicture', claim);
  element.addEventListener('pause', release);
  element.addEventListener('ended', release);
}
