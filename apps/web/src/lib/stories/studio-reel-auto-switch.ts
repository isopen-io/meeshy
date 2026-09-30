import type { PublicationKind } from './publication-kind';
import type { PublishChoice } from './publication-layout';
import type { StudioDraft } from './studio';

/**
 * **UN POST PASSE EN RÉEL dès qu'on pose une vidéo en fond ou un son sur une
 * image de fond** (#8794, jumelle web de `ComposerReelAutoSwitch`, #8793 —
 * directive porteur 2026-09-30, corrigée le même jour : la bascule va vers le
 * RÉEL, pas vers la story ; « Libre à l'utilisateur de rechoisir post ! »).
 *
 * La bascule ARME le réel sur la capsule Publier — ce que l'auteur voit et
 * touche — sans rien démonter. Le choix explicite de l'auteur au chevron
 * verrouille la composition : aucune bascule ne l'écrase ensuite. Le réel
 * n'est armé que si le menu l'OFFRE (`studioPublishRefusal`, la règle serveur
 * `qualifiesAsReel` : vidéo ou son d'au moins 3 s, ou deux images) — armer ce
 * que la passerelle refuserait serait un bouton qui ment. La durée d'un média
 * se mesure après sa pose : l'offre peut arriver un rendu après la demande,
 * d'où la relecture des DEUX à chaque changement.
 */
export type ReelAutoSwitchState = { readonly authorChose: boolean; readonly autoArmed: boolean };

export const NO_REEL_AUTO_SWITCH: ReelAutoSwitchState = { authorChose: false, autoArmed: false };

export type ReelAutoSwitchDecision = 'keep' | 'arm-reel' | 'disarm';

/** Une vidéo de FOND, ou un son posé sur une page dont le fond est une IMAGE
 * — sur n'importe quelle page. Une vidéo au premier plan ne bascule pas : elle
 * garde l'offre de réel à la publication (#8603). */
export function studioSceneDemandsReel(draft: StudioDraft): boolean {
  return draft.pages.some((page) => page.background?.mediaType === 'video' || (page.background?.mediaType === 'image' && page.sound !== null));
}

export function reelAutoSwitchDecision({
  demands,
  entryKind,
  state,
  reelChoosable,
}: {
  readonly demands: boolean;
  /** Le format du POINT D'ENTRÉE — seule la création de post bascule. */
  readonly entryKind: PublicationKind;
  readonly state: ReelAutoSwitchState;
  readonly reelChoosable: boolean;
}): ReelAutoSwitchDecision {
  if (state.authorChose || entryKind !== 'POST') return 'keep';
  if (demands && !state.autoArmed && reelChoosable) return 'arm-reel';
  if (!demands && state.autoArmed) return 'disarm';
  return 'keep';
}

export function reelAutoSwitchApplied(
  decision: ReelAutoSwitchDecision,
  state: ReelAutoSwitchState,
): { readonly choice: PublishChoice; readonly state: ReelAutoSwitchState } | null {
  if (decision === 'arm-reel') return { choice: { kind: 'REEL', layout: null }, state: { authorChose: state.authorChose, autoArmed: true } };
  if (decision === 'disarm') return { choice: { kind: 'POST', layout: null }, state: { authorChose: state.authorChose, autoArmed: false } };
  return null;
}

export const reelAutoSwitchAuthorChose = (state: ReelAutoSwitchState): ReelAutoSwitchState => ({ authorChose: true, autoArmed: state.autoArmed });
