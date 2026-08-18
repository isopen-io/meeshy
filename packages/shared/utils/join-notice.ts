/**
 * Avis d'arrivée — « X a rejoint la conversation ».
 *
 * Quatre portes font entrer quelqu'un (lien anonyme, lien inscrit, ajout par un
 * membre, invitation) et aucune ne le disait au fil : les présents découvraient
 * l'arrivant à son premier message. Rien n'indiquait non plus qu'un visiteur
 * venu par lien public n'a PAS de compte.
 *
 * Le message porte son sens dans `metadata`, jamais dans son texte — même
 * contrat que le résumé d'appel (`call-summary.ts`). Le `content` stocké n'est
 * qu'un repli français pour les surfaces sans rendu dédié (aperçu de liste,
 * notification, export) et pour les clients antérieurs à ce `kind`. Un texte
 * figé en base ne peut pas suivre le Prisme Linguistique ; une métadonnée, si.
 */

export const JOIN_NOTICE_KIND = 'member-joined' as const;

export type JoinNoticeMetadata = {
  readonly kind: typeof JOIN_NOTICE_KIND;
  /** `Participant.id` de l'arrivant — il est l'auteur de son propre avis. */
  readonly participantId: string;
  readonly displayName: string;
  /** L'arrivant a-t-il un compte ? Décisif quand la porte est un lien public. */
  readonly isAnonymous: boolean;
  /** Entré par un lien de partage, ou ajouté/invité par un membre. */
  readonly viaShareLink: boolean;
};

/**
 * Lit `Message.metadata` comme un avis d'arrivée, ou rend `null`.
 *
 * `metadata` est un champ JSON libre partagé par plusieurs sortes de messages
 * système : le lecteur VALIDE plutôt qu'il ne caste. Un `kind` absent, une
 * forme partielle ou un message d'une autre famille ressortent `null`, et
 * l'appelant retombe sur son rendu ordinaire — jamais sur une carte vide.
 */
export function parseJoinNotice(metadata: unknown): JoinNoticeMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const raw = metadata as Record<string, unknown>;
  if (raw.kind !== JOIN_NOTICE_KIND) return null;
  if (typeof raw.participantId !== 'string' || !raw.participantId) return null;
  if (typeof raw.displayName !== 'string' || !raw.displayName) return null;

  return {
    kind: JOIN_NOTICE_KIND,
    participantId: raw.participantId,
    displayName: raw.displayName,
    isAnonymous: raw.isAnonymous === true,
    viaShareLink: raw.viaShareLink === true,
  };
}
