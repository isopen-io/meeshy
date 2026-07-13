/**
 * Forme minimale d'un participant porteur d'un avatar : avatar local optionnel
 * (`Participant.avatar`) + avatar du compte utilisateur lié optionnel (`User.avatar`).
 * Couvre les participants enregistrés, anonymes et les `sender` de message.
 */
export type AvatarBearingParticipant = {
  readonly avatar?: string | null;
  readonly user?: { readonly avatar?: string | null } | null;
};

const isNonBlankAvatar = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Source unique de la résolution de l'avatar à afficher pour un participant.
 *
 * Ordre canonique : avatar **local** du participant (priorité — ex. avatar par
 * conversation) → avatar du **compte utilisateur** lié → `null` (aucune photo).
 *
 * Une chaîne **vide ou blanche** est traitée comme « pas d'avatar » (et non comme
 * une URL valide) : un `avatar: ''` local retombe donc sur l'avatar du compte, et
 * deux valeurs blanches renvoient `null`. Sans cette normalisation, `??` laissait
 * fuir la chaîne vide et le client rendait un `<img src="">` parasite (rechargement
 * de la page courante). Aligne cette source unique sur `getUserDisplayName` (web).
 *
 * Centralise une décision produit jusqu'ici réécrite à la main dans la gateway,
 * supprimant par construction les divergences (fallback local oublié, ordre inversé).
 */
export const resolveParticipantAvatar = (
  participant?: AvatarBearingParticipant | null,
): string | null =>
  [participant?.avatar, participant?.user?.avatar].find(isNonBlankAvatar) ?? null;
