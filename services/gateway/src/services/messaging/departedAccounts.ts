/**
 * **QUI n'est plus un destinataire parce que son COMPTE n'existe plus** (#18910, serveur-transport-5) — le
 * prédicat, posé sur des participants DÉJÀ LUS, jumeau de `pendingRequestUserIds`.
 *
 * La purge d'un compte supprimé ne retire pas ses participations (`Participant.isActive` reste vrai, seul le nom
 * est anonymisé) : l'éventail d'envoi le comptait donc parmi les membres, créait une ligne `Notification` à son
 * nom et poussait vers lui. L'état du compte voyage avec la lecture des participants (`user: { isActive, deletedAt }`) :
 * aucune lecture de plus, jamais une par push.
 *
 * Module FEUILLE, sans dépendance, pour la raison que `pendingMessageRequests` donne : un prédicat pur qu'un double
 * de test ne peut pas remplacer. Une ligne SANS la relation (`undefined`, projection qui ne la demande pas) n'est pas
 * jugée ; `null` (la ligne `User` a disparu) l'est.
 */
type ParticipantAccount = {
  readonly userId: string | null;
  readonly user?: { readonly isActive: boolean; readonly deletedAt?: Date | null } | null;
};

const isDeparted = (participant: ParticipantAccount): boolean =>
  participant.user === null || (participant.user !== undefined && (participant.user.isActive !== true || participant.user.deletedAt != null));

export const departedAccountUserIds = (participants: readonly ParticipantAccount[]): ReadonlySet<string> =>
  new Set(participants.flatMap((participant) => (participant.userId !== null && isDeparted(participant) ? [participant.userId] : [])));
