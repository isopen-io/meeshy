/**
 * Forme minimale d'un participant porteur d'un avatar : avatar local optionnel
 * (`Participant.avatar`) + avatar du compte utilisateur lié optionnel (`User.avatar`).
 * Couvre les participants enregistrés, anonymes et les `sender` de message.
 */
export type AvatarBearingParticipant = {
  readonly avatar?: string | null;
  readonly user?: { readonly avatar?: string | null } | null;
};

/**
 * Source unique de la résolution de l'avatar à afficher pour un participant.
 *
 * Ordre canonique : avatar **local** du participant (priorité — ex. avatar par
 * conversation) → avatar du **compte utilisateur** lié → `null` (aucune photo).
 *
 * Centralise une décision produit jusqu'ici réécrite à la main dans la gateway,
 * supprimant par construction les divergences (fallback local oublié, ordre inversé).
 */
export const resolveParticipantAvatar = (
  participant?: AvatarBearingParticipant | null,
): string | null => participant?.avatar ?? participant?.user?.avatar ?? null;
