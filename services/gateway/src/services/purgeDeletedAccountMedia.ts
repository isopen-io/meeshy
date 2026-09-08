import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { reclaimMediaRowBytes, type PostMediaByteRemover } from './posts/reclaimPostMediaBytes';

const log = enhancedLogger.child({ module: 'purgeDeletedAccountMedia' });

/**
 * Purge les médias physiques d'un compte supprimé, à la fin de sa période de
 * grâce (#5690, suite de #3632/#5688/#5689) — `MessageAttachment` et
 * `PostMedia`, les deux catégories que `me/export-sections.ts` (#3633)
 * définit déjà comme « médias » pour l'export RGPD (`uploadedBy` /
 * `uploaderId`, mêmes filtres repris ici pour la cohérence).
 *
 * ─── POURQUOI CE N'EST PAS UNE LIGNE AJOUTÉE À `AccountPurgeService` ────────
 *
 * Les trois tables qu'il purge (sessions, profil vocal, liens) n'ont pas
 * d'octets physiques — un `deleteMany` suffit. Un média EN A, et le dépôt
 * porte DEUX infrastructures de suppression PHYSIQUE distinctes, chacune
 * avec ses propres pièges déjà documentés :
 *
 * - `MessageAttachment` → `AttachmentService.deleteAttachment`, qui compte
 *   les références PARTAGÉES d'un `filePath`/`thumbnailPath` avant de
 *   libérer l'octet (un message transféré peut pointer le même fichier).
 * - `PostMedia` → `reclaimMediaRowBytes`, dont le SEUL garde-fou est plus
 *   subtil : un `Sound` SURVIT au post dont il est né, et son `coverUrl` est
 *   dénormalisé depuis `PostMedia.thumbnailUrl ?? fileUrl` — effacer cet
 *   octet laisserait un son d'un AUTRE utilisateur sans visuel pour
 *   toujours. Un `deleteMany` brut romprait cette garantie.
 *
 * Dupliquer l'une ou l'autre règle ici serait exactement l'erreur que
 * CLAUDE.md nomme (« Cette entité a-t-elle une JUMELLE ? ») — ce module
 * RÉUTILISE les deux, n'en réécrit aucune.
 *
 * ─── L'ORDRE AVEC #5689 ──────────────────────────────────────────────────
 *
 * `MaintenanceService` appelle ce balayage APRÈS `purgeMessagesOfDeletedAccount`
 * (#5689) dans `processAccountDeletionRequests` — les messages du compte
 * sont donc déjà anonymisés, et les pièces jointes qu'ils portaient déjà
 * supprimées par #5689 lui-même (qui appelle `AttachmentService.deleteAttachment`
 * pour chaque attachment de chaque message qu'il traite), avant que ce
 * balayage-ci ne s'exécute : pas de fenêtre où un lecteur verrait un message
 * anonymisé avec sa pièce jointe encore en clair, ni l'inverse. Ce qui reste
 * à couvrir ici : les attachments jamais rattachés à un message (en
 * attente), ceux dont le message était déjà `deletedAt` avant le passage de
 * #5689 (donc jamais touchés par lui), et tout `PostMedia` du compte —
 * catégorie qu'aucun des deux précédents ne connaît.
 *
 * Best-effort de bout en bout, même posture que les balayages voisins
 * (`ExpiredMessagesCleanupService`, `anonymizeDeletedAccountMessages.ts`) :
 * un fichier ou une ligne qui résiste ne doit jamais empêcher la reprise des
 * autres, ni bloquer la même fournée indéfiniment.
 */

/** La seule chose dont ce chemin a besoin pour supprimer un `MessageAttachment`. */
export interface DeletedAccountAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

export interface PurgeDeletedAccountMediaOptions {
  /** Médias traités par fournée. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * `MessageAttachment` du compte — un par un, via `AttachmentService`, jamais
 * un `deleteMany` : chaque suppression décrémente le compteur de références
 * partagées d'un `filePath`, que seule cette méthode connaît.
 *
 * Exclusion explicite (`notIn`) des ids déjà tentés cette PASSE : sans elle,
 * un attachment dont la suppression échoue resterait éligible pour toujours
 * et boucler la fournée sans jamais progresser — même garde qu'#5689.
 */
async function purgeAttachments(
  prisma: PrismaClient,
  attachmentRemover: DeletedAccountAttachmentRemover,
  userId: string,
  batchSize: number,
): Promise<number> {
  let deleted = 0;
  const failedIds = new Set<string>();

  for (;;) {
    const batch = await prisma.messageAttachment.findMany({
      where: {
        uploadedBy: userId,
        isAnonymous: false,
        ...(failedIds.size > 0 ? { id: { notIn: [...failedIds] } } : {}),
      },
      select: { id: true },
      take: batchSize,
    });
    if (batch.length === 0) break;

    for (const attachment of batch) {
      try {
        await attachmentRemover.deleteAttachment(attachment.id);
        deleted += 1;
      } catch (err) {
        log.warn('deleted-account attachment purge failed', { attachmentId: attachment.id, err });
        failedIds.add(attachment.id);
      }
    }

    if (batch.length < batchSize) break;
  }

  return deleted;
}

/**
 * `PostMedia` du compte — lignes lues AVANT toute suppression (le patron de
 * `sweepPendingPostMedia`), octets réclamés via `reclaimMediaRowBytes` (garde
 * `Sound` incluse), puis lignes supprimées en lot.
 *
 * Fail-CLOSED sur l'échec du garde-fou (la requête `Sound`) : détruire des
 * lignes sans savoir quels fichiers un `Sound` référence encore laisserait
 * ces fichiers hors de portée de tout balayage futur — la fournée est
 * abandonnée, la prochaine passe de maintenance la rejoue en entier. Chaque
 * itération réduit strictement le nombre de lignes restantes du compte (la
 * suppression est un LOT, jamais un id à la fois), donc la boucle termine
 * sans avoir besoin de la même exclusion `notIn` que les attachments.
 */
async function purgePostMedia(
  prisma: PrismaClient,
  mediaService: PostMediaByteRemover,
  userId: string,
  batchSize: number,
): Promise<number> {
  let deleted = 0;

  for (;;) {
    const rows = await prisma.postMedia.findMany({
      where: { uploaderId: userId },
      select: { id: true, fileUrl: true, thumbnailUrl: true },
      take: batchSize,
    });
    if (rows.length === 0) break;

    try {
      await reclaimMediaRowBytes(prisma, mediaService, rows);
    } catch (err) {
      log.warn('deleted-account post-media byte reclaim failed — batch left for next sweep', { userId, err });
      break;
    }

    const removed = await prisma.postMedia.deleteMany({
      where: { id: { in: rows.map((row) => row.id) }, uploaderId: userId },
    });
    deleted += removed.count;

    if (rows.length < batchSize) break;
  }

  return deleted;
}

export async function purgeMediaOfDeletedAccount(
  prisma: PrismaClient,
  attachmentRemover: DeletedAccountAttachmentRemover,
  mediaService: PostMediaByteRemover,
  userId: string,
  options: PurgeDeletedAccountMediaOptions = {},
): Promise<{ attachmentsDeleted: number; postMediaDeleted: number }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const attachmentsDeleted = await purgeAttachments(prisma, attachmentRemover, userId, batchSize);
  const postMediaDeleted = await purgePostMedia(prisma, mediaService, userId, batchSize);

  log.info('deleted-account media purged', { userId, attachmentsDeleted, postMediaDeleted });
  return { attachmentsDeleted, postMediaDeleted };
}
