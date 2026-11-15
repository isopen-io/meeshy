/**
 * **LA LOI DE LA FEUILLE D'ÉDITION D'UNE PUBLICATION** (#7534) — PURE, sans
 * DOM, miroir `EditPostSheet.swift:199-247` :
 *
 * - `contentChanged` (`:199-200`) — comparé sur le TEXTE ROGNÉ des deux côtés,
 *   jamais le brut : un espace de tête ou de fin ne rend pas « Publier »
 *   actif, exactement comme `performCommentEdit` (`comment-gestures.ts`)
 *   refuse un aller-retour qui « ne change rien ».
 * - `isValid` (`:233-243`) — bornée sur le texte ROGNÉ (`:234`), celui que
 *   `editPost` envoie ; RÉDUITE au texte : la clause « média restant »
 *   d'iOS ne s'applique pas ici, cette tranche ne porte que `content`
 *   (§ Périmètre de la spécification #7534 — médias hors tranche, issue
 *   compagnon). Non soumissible à vide/blanc, ou au-delà de
 *   `POST_CONTENT_MAX_LENGTH`.
 * - `remainingChars` (`:245-247`) — compté sur le texte BRUT (pas rogné,
 *   `EditPostSheet.swift:246`), jamais négatif.
 *
 * `submittable` COMBINE `changed` et `isValid` (contrairement à iOS qui les
 * garde distincts sur deux gardes du bouton) : la spécification #7534 n'a
 * qu'UN seul bouton à désactiver, « Publier », et les deux raisons de le
 * désactiver (invalide, inchangé) sont la MÊME question posée à l'écran.
 */
export const POST_CONTENT_MAX_LENGTH = 5000; // UpdatePostSchema.content, routes/posts/types.ts:378 ; EditPostSheet.swift:152
export const POST_CONTENT_WARNING_REMAINING = 100; // EditPostSheet.swift:289

export type PublicationEditState = {
  readonly trimmed: string;
  readonly changed: boolean;
  readonly submittable: boolean;
  readonly remaining: number;
  readonly warning: boolean;
};

export function publicationEditState(params: { readonly original: string; readonly draft: string }): PublicationEditState {
  const { original, draft } = params;
  const trimmed = draft.trim();
  const changed = trimmed !== original.trim();
  const isValid = trimmed !== '' && trimmed.length <= POST_CONTENT_MAX_LENGTH;
  const remaining = Math.max(0, POST_CONTENT_MAX_LENGTH - draft.length);

  return {
    trimmed,
    changed,
    submittable: changed && isValid,
    remaining,
    warning: remaining < POST_CONTENT_WARNING_REMAINING,
  };
}
