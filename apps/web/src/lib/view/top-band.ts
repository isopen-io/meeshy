import { createStore } from 'zustand/vanilla';

import { showsFloatingMenus } from './floating-gate';

/**
 * LE BANDEAU DU HAUT (#9279, #9494) — la colonne fixe que la coquille pose au
 * sommet de toutes les routes, miroir du `VStack` de `CallPresentationLayer`
 * iOS. Trois occupants, une loi de priorité :
 *
 *   1. l'APPEL (« Reprendre l'appel », un appel local ou entrant) ;
 *   2. l'AUDIO confié au mini-lecteur ;
 *   3. la BANNIÈRE DU JOUEUR, seulement quand ni l'un ni l'autre n'est là.
 *
 * L'appel et l'audio s'empilent (l'appel au-dessus) ; la bannière du joueur ne
 * cohabite avec aucun des deux : elle s'efface quand l'un arrive et revient,
 * à la même place, quand ils partent.
 *
 * Module LÉGER, lu par la coquille avant le premier pixel : aucun rendu,
 * aucune donnée du jeu.
 */
export type TopBandSlots = {
  readonly call: boolean;
  readonly audio: boolean;
  readonly player: boolean;
};

export function topBandSlots({ call, audio, player }: TopBandSlots): TopBandSlots {
  return { call, audio, player: player && !call && !audio };
}

/**
 * LA SORTIE DE LA BANNIÈRE (#9494) — « la bannière s'efface quand l'un d'eux
 * arrive et revient quand ils partent, en glissant à la même place » : elle ne
 * disparaît jamais sèchement. Quatre phases :
 *
 *   · `shown`   — dans la pile ;
 *   · `holding` — l'occupant arrive mais n'est pas PRÊT (le chunk du
 *                 mini-lecteur se charge) : elle RESTE, le bandeau n'est
 *                 jamais vide ;
 *   · `leaving` — l'occupant est prêt : elle sort de la pile et glisse
 *                 (`BANNER_EXIT_MS`), l'occupant prend sa place tout de suite ;
 *   · `gone`    — retirée.
 *
 * Quand AUCUN occupant ne la remplace (jeu masqué, route sans bannière,
 * déconnexion), il n'y a rien à glisser : elle part tout de suite. Voulue de
 * nouveau, elle est `shown` d'où qu'elle vienne.
 */
export type BannerPhase = 'shown' | 'holding' | 'leaving' | 'gone';

export const BANNER_EXIT_MS = 220;

export function nextBannerPhase({ phase, wanted, occupied, occupantReady }: {
  readonly phase: BannerPhase;
  readonly wanted: boolean;
  readonly occupied: boolean;
  readonly occupantReady: boolean;
}): BannerPhase {
  if (wanted) return 'shown';
  if (!occupied || phase === 'gone') return 'gone';
  if (phase === 'leaving') return 'leaving';
  return occupantReady ? 'leaving' : 'holding';
}

/** Le chunk du mini-lecteur est chargé : la bannière peut lui céder la place sans laisser le bandeau vide. */
export const miniPlayerReadyStore = createStore<{ readonly ready: boolean }>(() => ({ ready: false }));

export function reportMiniPlayerReady(): void {
  if (!miniPlayerReadyStore.getState().ready) miniPlayerReadyStore.setState({ ready: true });
}

/**
 * « REPRENDRE L'APPEL » SE DÉCLARE (#9494) — la bannière de reprise décide
 * seule si elle se montre (`resumableCall` : la lecture `GET /calls/active`,
 * l'appel local, le fil ouvert). La coquille n'a pas à refaire ce calcul pour
 * savoir que le bandeau est pris : la bannière le lui dit.
 */
export const callResumeShownStore = createStore<{ readonly shown: boolean }>(() => ({ shown: false }));

export function reportCallResumeShown(shown: boolean): void {
  if (callResumeShownStore.getState().shown !== shown) callResumeShownStore.setState({ shown });
}

/**
 * LES ROUTES QUI PORTENT LA BANNIÈRE DU JOUEUR — les hubs de la racine, ceux
 * qui portent déjà les menus flottants (`floating-gate.ts`). La liste est
 * FERMÉE pour les mêmes raisons : un écran sans session n'a pas de joueur à
 * montrer, le fil a besoin de toute sa hauteur, une visionneuse est plein
 * cadre. Progression n'en fait pas partie : son héros dit déjà tout, et le
 * toucher de la bannière y mène.
 */
export function showsPlayerBanner(routeKey: string): boolean {
  return showsFloatingMenus(routeKey);
}
