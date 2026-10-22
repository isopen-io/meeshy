import { lazy, Suspense } from 'react';

/**
 * LA PORTE DE L'HÔTE DES INVITATIONS (#10174, L18) — un module de quelques lignes entre la bande du haut (dans
 * l'entrée) et l'hôte (lourd : le coordinateur, les moments, la carte, le catalogue du jeu). L'entrée ne
 * référence que CE chunk : la liste de préchargement qu'elle porte pour lui ne nomme aucun des chunks du jeu
 * (mesuré : l'hôte importé directement coûtait 0,69 Ko gzip à la première peinture, par les seuls noms de ses
 * dépendances ; par cette porte, un nom). Le second saut se paie au repos, jamais avant le premier pixel.
 */
const Host = lazy(() => import('./game-photo-alert-host').then((m) => ({ default: m.GamePhotoAlertHost })));

export function GamePhotoAlertGate({ routeKey }: { readonly routeKey: string }) {
  return (
    <Suspense fallback={null}>
      <Host routeKey={routeKey} />
    </Suspense>
  );
}
