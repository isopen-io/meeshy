import { useEffect } from 'react';

import { mediaCoordinator, type MediaCoordinator } from './media-coordinator';

/**
 * LE LECTEUR DE STORY RÉCLAME LA LECTURE (#9586) — miroir de
 * `StoryMediaCoordinator.shared.activate` à l'apparition de `StoryViewerView`
 * (iOS) : ouvrir une story arrête ce qui jouait ailleurs (tuile vidéo sonore,
 * vocal, lecteur natif d'un commentaire).
 *
 * La réclamation vaut pour le LECTEUR, pas pour l'élément `<video>` : une story
 * d'image, de texte ou une scène v3 s'ouvre aussi par-dessus ce qui jouait, et
 * la vidéo d'une story est muette et en boucle. Le rappel de pause ne fait donc
 * rien, comme celui d'iOS : un média lancé APRÈS l'ouverture (un commentaire
 * vidéo dans la feuille) prend l'exclusivité sans figer la story, qui suit sa
 * propre règle de boucle (#9821). Le démontage rend l'exclusivité, et ne la
 * retire à personne d'autre (`release` est sans effet sur un autre actif).
 */
const storyClaims = { next: 0 };

export function useStoryMediaClaim(coordinator: MediaCoordinator = mediaCoordinator): void {
  useEffect(() => {
    storyClaims.next += 1;
    const key = `story-viewer#${storyClaims.next}`;
    coordinator.claim(key, () => undefined);
    return () => coordinator.release(key);
  }, [coordinator]);
}
