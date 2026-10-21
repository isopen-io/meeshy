import { lazy, Suspense } from 'react';

/**
 * LES EMPLACEMENTS DU JEU DANS LES PROFILS (#9481, #10092) — le niveau et le rang sur la bannière
 * d'une fiche (la sienne, celle d'un autre), et la bande de la carte de contact ; chargés À LA
 * DEMANDE (`lazy` + `Suspense`) : l'écran qui les héberge ne paie ni le chunk du
 * jeu ni son catalogue avant sa première peinture, et le jeu arrive quand il est
 * prêt, en silence (`fallback={null}` : un profil n'a pas besoin d'un squelette de
 * plus pour une carte qui n'existe pas toujours).
 *
 * Le contenu est dans `game-profile-connected.tsx` ; les témoins rendent ses
 * pièces PURES (`game-profile-banner`, `game-contact-strip`).
 */
const BannerOwn = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.GameBannerOwnConnected })));
const BannerVisitor = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.GameBannerVisitorConnected })));
const Strip = lazy(() => import('./game-profile-connected').then((m) => ({ default: m.ContactGameStripConnected })));

export function ContactGameStripSlot({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <Strip userId={userId} enabled={enabled} />
    </Suspense>
  );
}

/** LE NIVEAU ET LE RANG SUR LA BANNIÈRE (#10092) — à poser DANS la bannière (positionnée). */
export function GameBannerOwnSlot({ enabled }: { readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <BannerOwn enabled={enabled} />
    </Suspense>
  );
}

export function GameBannerVisitorSlot({ userId, enabled }: { readonly userId: string; readonly enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <BannerVisitor userId={userId} enabled={enabled} />
    </Suspense>
  );
}
