import { useAppBadge } from '@/lib/view/use-app-badge';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';

import { useAppUpdateAnnounced } from '@/lib/app-update/pending-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { showsFloatingMenus } from '@/lib/view/floating-gate';
import { useSyncPillArmed } from '@/lib/view/sync-pill-gate';
import { useRoute } from '@/lib/router';

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
 * qui la REND.
 *
 * **Mais son chunk est CHERCHÉ dès le premier rendu, pas au moment du besoin.**
 * « À la demande » se retourne contre cette pastille et contre elle seule : le
 * moment où elle sert est précisément celui où le réseau est tombé. Mesuré —
 * `net::ERR_INTERNET_DISCONNECTED` sur le chunk, `Suspense` jamais résolu,
 * `fallback={null}`, donc AUCUN signe de coupure à l'écran. L'indicateur
 * d'absence de réseau allait le chercher sur le réseau.
 *
 * Le préchargement sépare les deux questions que `lazy()` confondait : ce qui
 * pèse AVANT LE PREMIER PIXEL (le budget — le chunk reste hors du point
 * d'entrée) et ce qui est DISPONIBLE quand on en a besoin (la fiabilité — il
 * est résolu pendant qu'on est encore en ligne).
 */
const chargerPastille = () => import('./sync-pill').then((m) => ({ default: m.SyncPill }));
const SyncPill = lazy(chargerPastille);

/**
 * ...ET LES DEUX MENUS FLOTTANTS (#6104), seconde exception à la minceur, sur
 * la MÊME fondation que la première : iOS n'a pas de barre commune, mais il a
 * bien une couche de chrome flottant au-dessus de tous les écrans
 * (`RootChromeLayer`), et ses deux boutons y vivent
 * (`RootView.draggableFloatingButtons`, `.zIndex(100)`).
 *
 * **Ils sont chargés à la demande pour la raison déjà mesurée sur la
 * pastille** — la première peinture est à 37,19 Ko pour un plafond de 40 — et
 * **préchargés pour une raison DIFFÉRENTE de la sienne**. La pastille est
 * préchargée parce que le moment où elle sert est celui où le réseau est
 * tombé ; les menus le sont parce qu'ils sont le SEUL chemin vers sept écrans
 * de l'application : les attendre au premier appui ferait clignoter la
 * navigation entière au démarrage.
 *
 * **`showsFloatingMenus` seul reste en statique**, exactement comme
 * `useSyncPillArmed` : il ne connaît ni glyphe, ni libellé, ni géométrie — il
 * répond OUI ou NON sur une clé de route, et c'est son OUI qui rend le reste.
 */
const chargerMenus = () =>
  /* Les menus se disent dans la langue d'interface (#6206) : leur catalogue
     est attendu avec leur chunk, en parallèle — `import()` comme le catalogue
     sont idempotents, le préchargement ci-dessous ne paie rien deux fois. */
  Promise.all([import('./floating-menus'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([m]) => ({
    default: m.FloatingMenus,
  }));
const FloatingMenus = lazy(chargerMenus);

/**
 * ...ET LA BANNIÈRE DE MISE À JOUR (#6936), troisième exception à la minceur,
 * sur la MÊME fondation que les deux autres : iOS pose ses annonces vivantes
 * dans sa couche de chrome flottant, au-dessus de tous les écrans.
 *
 * **À la demande, et SANS préchargement** — contrairement à la pastille et aux
 * menus, dont les raisons de préchargement ne valent pas ici : la pastille sert
 * au moment où le réseau tombe, les menus sont le seul chemin vers sept écrans.
 * Une bannière de mise à jour, elle, ne peut apparaître QUE si le réseau vient
 * de répondre — c'est une version neuve qui vient d'être téléchargée. La payer
 * à chaque chargement de page pour une annonce qui n'arrive qu'aux
 * déploiements serait le contraire d'un budget tenu.
 *
 * `useAppUpdateAnnounced` seul reste en statique, exactement comme
 * `useSyncPillArmed` : il répond OUI ou NON, et c'est son OUI qui va chercher
 * la bannière, ses libellés et le contrôleur de mise à jour.
 */
const chargerBanniereMaj = () =>
  Promise.all([import('./app-update-banner'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([m]) => ({
    default: m.AppUpdateBanner,
  }));
const AppUpdateBanner = lazy(chargerBanniereMaj);

export default function Shell({ children }: { children: ReactNode }) {
  const pastilleArmee = useSyncPillArmed();
  const majAnnoncee = useAppUpdateAnnounced();
  const routeKey = useRoute().key;
  const menusArmes = showsFloatingMenus(routeKey);

  useAppBadge();

  /* APRÈS le premier pixel, pendant qu'on est encore en ligne. L'effet ne
     s'exécute pas au rendu serveur, donc le préchauffage institutionnel n'en
     paie rien ; et `import()` est idempotent — le rendu de la pastille réutilise
     le module déjà résolu au lieu de rouvrir une requête. */
  useEffect(() => {
    void chargerPastille();
    void chargerMenus();
  }, []);

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
      {majAnnoncee ? (
        <Suspense fallback={null}>
          <AppUpdateBanner />
        </Suspense>
      ) : null}
      {children}
      {/* APRÈS `children` : à z-index égal, c'est l'ordre du document qui
          tranche, et un menu recouvert par l'écran qu'il commande serait le
          défaut le plus bête du lot. */}
      {menusArmes ? (
        <Suspense fallback={null}>
          <FloatingMenus routeKey={routeKey} />
        </Suspense>
      ) : null}
    </div>
  );
}
