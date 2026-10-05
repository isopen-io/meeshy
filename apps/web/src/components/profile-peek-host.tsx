import { lazy, Suspense, useLayoutEffect } from 'react';

import { routeKey, useRoute } from '@/lib/router';
import { closeProfilePeek, registerProfilePeekHost, useProfilePeek } from '@/lib/view/profile-peek';

/**
 * **L'HÔTE DE LA FEUILLE DE PROFIL** — monté par la coquille, donc présent sur
 * toutes les routes, comme la feuille d'iOS est présentée par la racine
 * (`RootViewLayers.swift`, `.sheet(item: $router.participantProfileTarget)`).
 *
 * La feuille se charge À LA DEMANDE : la coquille est peinte avant le premier
 * pixel, et le profil (en-tête, gestes, signalement) n'a rien à y faire tant
 * qu'on n'a touché personne.
 *
 * **Elle se referme quand l'adresse change** — « Écrire » ouvre le fil,
 * « Ouvrir le profil complet » ouvre la page : la feuille laissée ouverte
 * recouvrirait l'écran qu'on vient de demander. La porte vers la page la
 * referme DANS son clic ; pour les autres navigations (« Écrire », retour
 * arrière), la fermeture est un effet de MISE EN PAGE : sous Preact, un
 * `useEffect` attend l'image suivante, et la feuille survivait une image
 * au-dessus de la page qu'on venait d'ouvrir (CI rouge, `check-rich-text`).
 */
const LazyProfilePeekSheet = lazy(() => import('@/components/profile-peek-sheet').then((m) => ({ default: m.ProfilePeekSheet })));

export function ProfilePeekHost() {
  const username = useProfilePeek();
  const address = routeKey(useRoute());

  useLayoutEffect(() => registerProfilePeekHost(), []);
  useLayoutEffect(() => closeProfilePeek, [address]);

  return username === null ? null : (
    <Suspense fallback={null}>
      <LazyProfilePeekSheet key={username} username={username} onClose={closeProfilePeek} />
    </Suspense>
  );
}
