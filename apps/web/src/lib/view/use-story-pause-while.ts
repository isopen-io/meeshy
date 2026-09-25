import { useEffect } from 'react';

/**
 * **UNE COUCHE PAR-DESSUS LA STORY LA MET EN ATTENTE** — la feuille de
 * commentaires (sans quoi la story avancerait sous le fil qu'on lit, et le
 * composeur changerait de publication à mi-phrase) et le profil de l'auteur
 * (miroir d'iOS, qui suspend le viewer tant que `UserProfileSheet` est
 * présentée). La couche fermée, la lecture reprend.
 */
export function useStoryPauseWhile(active: boolean, pause: () => void, resume: () => void): void {
  useEffect(() => {
    if (!active) return;
    pause();
    return () => resume();
  }, [active, pause, resume]);
}
