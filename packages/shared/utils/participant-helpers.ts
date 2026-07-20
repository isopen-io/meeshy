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
 * Forme minimale d'un participant porteur d'un nom d'affichage : `displayName`
 * local optionnel (`Participant.displayName`) + `displayName` du compte utilisateur
 * lié optionnel (`User.displayName`).
 */
export type DisplayNameBearingParticipant = {
  readonly displayName?: string | null;
  readonly user?: { readonly displayName?: string | null } | null;
};

const isNonBlank = (value?: string | null): value is string =>
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
  [participant?.avatar, participant?.user?.avatar].find(isNonBlank) ?? null;

/**
 * Source unique de la résolution du nom d'affichage porté par un participant.
 *
 * Ordre canonique : `displayName` **local** du participant → `displayName` du
 * **compte utilisateur** lié → `null`. Miroir strict de `resolveParticipantAvatar`
 * pour la même famille de bugs : une chaîne **vide ou blanche** est traitée comme
 * absente, ce qui restaure le fallback compte que `??` court-circuitait (un
 * `displayName: ''` local retombe sur le nom du compte au lieu de le masquer).
 *
 * Ne couvre QUE le niveau `displayName` (local → compte). Les fallbacks
 * `firstName lastName` / `username` restent la responsabilité du client via
 * `getUserDisplayName`, exactement comme aujourd'hui.
 */
export const resolveParticipantDisplayName = (
  participant?: DisplayNameBearingParticipant | null,
): string | null =>
  [participant?.displayName, participant?.user?.displayName].find(isNonBlank) ?? null;
