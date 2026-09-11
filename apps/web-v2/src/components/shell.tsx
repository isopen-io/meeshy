import type { ReactNode } from 'react';

import { SyncPill } from './sync-pill';

/**
 * LA COQUILLE — deliberement mince.
 *
 * Il n'y a NI barre d'onglets NI barre de navigation : l'app iOS n'en a
 * aucune (`.navigationBarHidden(true)` partout), chaque ecran dessine son
 * propre en-tete flottant. Une coquille qui poserait ici un chrome commun
 * ferait diverger les deux interfaces des le premier ecran.
 *
 * Ce qu'elle porte, et qu'aucun ecran ne doit reimplementer : le lien
 * d'evitement, VISIBLE au clavier — un lien d'evitement invisible n'evite
 * rien.
 *
 * ...et LA PASTILLE DE SYNCHRONISATION (#6080), seule exception à la minceur
 * ci-dessus — fondée sur la MÊME raison qu'elle. iOS n'a ni barre d'onglets ni
 * barre de navigation, mais il a bien UNE couche de chrome flottant au-dessus
 * de tous les écrans (`RootChromeLayer`), et c'est exactement là que vit sa
 * pastille. La poser dans chaque écran la ferait diverger d'un écran à
 * l'autre ; la poser ici la rend identique partout, ce que la coquille
 * cherchait déjà.
 */
export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#contenu"
        className="skip-link"
      >
        Aller au contenu
      </a>
      <SyncPill />
      {children}
    </div>
  );
}
