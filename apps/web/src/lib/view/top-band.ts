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
