/**
 * LA VISITE D'UN LIEN D'INVITATION (#7794).
 *
 * Une visite = l'aperçu public (`GET /anonymous/link/:identifier`) servi pour
 * un lien ouvert. C'est le chiffre « Visites » que les statistiques du lien
 * rendent à son auteur (`GET /links/:linkId/stats`).
 *
 * ## Pourquoi une commande brute et non `{ increment: 1 }`
 *
 * Prisma sur MongoDB traduit `increment` en pipeline
 * `$set: { champ: { $add: ['$champ', n] } }`, et `$add` rend `null` dès qu'un
 * opérande est absent : tout lien créé avant la colonne `visitCount` resterait
 * à `null` pour toujours, relu `0`, sans une erreur (même cause que #5742 et
 * #6428, `EngagementService.updateEngagementScore`). Le pipeline `$ifNull`
 * traite l'absence comme zéro, en une écriture atomique.
 */

type RawCommandRunner = {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
};

/** `@@map` absent du modèle : la collection porte le nom du modèle. */
const SHARE_LINK_COLLECTION = 'ConversationShareLink';

export async function recordShareLinkVisit(prisma: RawCommandRunner, shareLinkId: string): Promise<void> {
  await prisma.$runCommandRaw({
    update: SHARE_LINK_COLLECTION,
    updates: [{
      q: { _id: { $oid: shareLinkId } },
      u: [{ $set: { visitCount: { $add: [{ $ifNull: ['$visitCount', 0] }, 1] } } }],
    }],
  });
}
