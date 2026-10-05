import { lazy, Suspense } from 'react';

/**
 * LES EMPLACEMENTS DU JEU DANS LES PROFILS (#9481) — trois portes, chargées À LA
 * DEMANDE (`lazy` + `Suspense`) : l'écran qui les héberge ne paie ni le chunk du
 * jeu ni son catalogue avant sa première peinture, et le jeu arrive quand il est
 * prêt, en silence (`fallback={null}` : un profil n'a pas besoin d'un squelette de
 * plus pour une carte qui n'existe pas toujours).
 *
 * Le contenu est dans `game-profile-connected.tsx` ; les témoins rendent ses
 * pièces PURES (`game-profile-own`, `game-profile-visitor`).
 */
const Own = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.GameProfileOwnConnected })));
const Visitor = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.GameProfileVisitorConnected })));
const Strip = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.ContactGameStripConnected })));

export function GameProfileOwnSlot({ enabled }: { readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <Own enabled={enabled} />
    </Suspense>
  );
}

export function GameProfileVisitorSlot({ userId, name, enabled }: { readonly userId: string; readonly name: string; readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <Visitor userId={userId} name={name} enabled={enabled} />
    </Suspense>
  );
}

export function ContactGameStripSlot({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <Strip userId={userId} enabled={enabled} />
    </Suspense>
  );
}
