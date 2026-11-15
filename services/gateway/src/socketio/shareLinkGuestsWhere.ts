/**
 * Les invités entrés par un lien, lus comme `guestShareLinkId` les lit : la
 * colonne de la participation, et la session embarquée en repli (#10440).
 * Une seule forme pour la révocation et pour la mesure de ce qu'elle coûtera
 * (#10470).
 */
export function shareLinkGuestsOf(shareLinkId: string) {
  return { OR: [{ shareLinkId }, { anonymousSession: { is: { shareLinkId } } }] };
}

/** Les invités ACTIFS entrés par ce lien. */
export function shareLinkActiveGuestsWhere(shareLinkId: string) {
  return { type: 'anonymous', isActive: true, ...shareLinkGuestsOf(shareLinkId) };
}
