/**
 * Forme minimale d'un participant porteur d'un avatar : avatar local optionnel
 * (`Participant.avatar`) + avatar du compte utilisateur lié optionnel (`User.avatar`).
 * Couvre les participants enregistrés, anonymes et les `sender` de message.
 */
export type AvatarBearingParticipant = {
  readonly avatar?: string | null;
  readonly user?: { readonly avatar?: string | null } | null;
};

const hasAvatarContent = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Source unique de la résolution de l'avatar à afficher pour un participant.
 *
 * Ordre canonique : avatar **local** du participant (priorité — ex. avatar par
 * conversation) → avatar du **compte utilisateur** lié → `null` (aucune photo).
 *
 * Une chaîne **vide** ou **blanche** est traitée comme « aucun avatar » et
 * déclenche le fallback — un `??` brut la laisserait passer et émettrait un
 * `<img src="">` (requête réseau parasite, image cassée). Aligné sur le frère
 * SSOT `getSenderUserId`, qui garde lui aussi les chaînes vides.
 *
 * Centralise une décision produit jusqu'ici réécrite à la main dans la gateway,
 * supprimant par construction les divergences (fallback local oublié, ordre inversé).
 */
export const resolveParticipantAvatar = (
  participant?: AvatarBearingParticipant | null,
): string | null => {
  const local = participant?.avatar;
  if (hasAvatarContent(local)) return local;
  const account = participant?.user?.avatar;
  if (hasAvatarContent(account)) return account;
  return null;
};
