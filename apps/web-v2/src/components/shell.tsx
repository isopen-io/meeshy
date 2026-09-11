import { lazy, Suspense, type ReactNode } from 'react';

import { useSyncPillArmed } from '@/lib/view/sync-pill-gate';

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
 *
 * **Elle est chargée À LA DEMANDE, et ce n'est pas une optimisation
 * spéculative** : montée en statique, elle pesait 5,57 Ko AVANT LE PREMIER
 * PIXEL — mesuré, 37,15 → 42,72 Ko —, soit 14 % d'un budget de 40 Ko dépensés
 * sur tous les écrans pour un objet invisible la quasi-totalité du temps. Le
 * gate du poids l'a refusée. Seul `useSyncPillArmed` reste en statique : il ne
 * connaît ni glyphe, ni libellé, ni la loi de priorité, et c'est sa réponse OUI
 * qui va chercher le reste.
 */
const SyncPill = lazy(() => import('./sync-pill').then((m) => ({ default: m.SyncPill })));

export default function Shell({ children }: { children: ReactNode }) {
  const pastilleArmee = useSyncPillArmed();

  return (
    <div className="min-h-dvh">
      <a
        href="#contenu"
        className="skip-link"
      >
        Aller au contenu
      </a>
      {/* `fallback={null}` : une pastille qui n'est pas encore là ne doit rien
          peindre — surtout pas un squelette, qui annoncerait un état qu'on ne
          connaît pas encore. */}
      {pastilleArmee ? (
        <Suspense fallback={null}>
          <SyncPill />
        </Suspense>
      ) : null}
      {children}
    </div>
  );
}
