import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unclaimedMediaWhere } from './mediaOwnership';
import { reclaimMediaRowBytes, type PostMediaByteRemover } from './reclaimPostMediaBytes';

/**
 * Le balayage des `PostMedia` que personne n'a réclamés.
 *
 * ─── LE TROU ──────────────────────────────────────────────────────────────
 * Un média téléversé par un composer naît « en attente » (`postId: null`,
 * `commentId` absent) et n'est rattaché qu'à la publication. Fermer le
 * composer sans publier — un onglet refermé, un crash, une perte réseau — le
 * laisse là pour toujours : `MaintenanceService.cleanupOrphanedAttachments`
 * ne ramasse que les `MessageAttachment` orphelins, et
 * `OrphanMediaCleanupService` ne connaît que sa propre boîte d'envoi (son
 * unique producteur est l'instantané de repost).
 *
 * Le trou était LATENT tant que le composer web téléversait en
 * `MessageAttachment` — une forme, elle, moissonnée. Il s'est ouvert quand le
 * composer de publication a commencé à taguer ses uploads (`uploadcontext`) :
 * la même fuite, déplacée vers une table sans balayage. Et l'URL publique
 * d'un média est servie SANS authentification (`GET /attachments/file/*`
 * n'a aucune `preValidation`) — une capacité que seul l'`unlink` révoque.
 *
 * ─── POURQUOI CÔTÉ SERVEUR, ET PAS DANS LE COMPOSER ───────────────────────
 * Un client ne rappelle rien après un onglet fermé, une batterie vide ou un
 * réseau coupé — les trois cas majoritaires. Et faire relâcher le pool par
 * `clearAttachments` serait pire que rien : les composers l'appellent DANS
 * `handlePublish`, juste après avoir remis `mediaIds` — relâcher là courrait
 * après la publication qu'on vient de demander.
 *
 * ─── L'ORDRE, ET LA FENÊTRE QUI RESTE ─────────────────────────────────────
 * Les OCTETS avant la LIGNE, comme partout ailleurs : une fois la ligne
 * partie, plus rien ne dit où sont ses octets — c'est précisément la fuite
 * qu'on ferme. La destruction re-pose la garde « libre » pour qu'une
 * publication concurrente ne perde pas sa LIGNE ; ses octets, eux, seraient
 * déjà partis. La fenêtre demande qu'un média attende 24 h puis soit réclamé
 * dans l'intervalle de deux requêtes — et l'inverser (ligne d'abord)
 * rouvrirait la fuite à chaque interruption du processus.
 */
export type SweepPendingPostMediaPrisma = Pick<PrismaClient, 'sound'> & {
  postMedia: Pick<PrismaClient['postMedia'], 'findMany' | 'deleteMany'>;
};

export interface SweepPendingPostMediaOptions {
  /** Les médias créés AVANT cette date sont considérés abandonnés. */
  readonly olderThan: Date;
  /**
   * Borne de fournée. Une passe qui lirait toute la table bloquerait la
   * suivante ; le balayage repasse, et l'abandon n'est pas pressé.
   */
  readonly batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 500;

export async function sweepPendingPostMedia(
  prisma: SweepPendingPostMediaPrisma,
  storage: PostMediaByteRemover,
  options: SweepPendingPostMediaOptions,
): Promise<{ swept: number; reclaimed: number }> {
  const rows = await prisma.postMedia.findMany({
    where: { ...unclaimedMediaWhere(), createdAt: { lt: options.olderThan } },
    select: { id: true, fileUrl: true, thumbnailUrl: true },
    take: options.batchSize ?? DEFAULT_BATCH_SIZE,
  });

  if (rows.length === 0) return { swept: 0, reclaimed: 0 };

  const reclaimed = await reclaimMediaRowBytes(prisma, storage, rows);
  const removed = await prisma.postMedia.deleteMany({
    where: { id: { in: rows.map((row) => row.id) }, ...unclaimedMediaWhere() },
  });

  return { swept: removed.count, reclaimed };
}
