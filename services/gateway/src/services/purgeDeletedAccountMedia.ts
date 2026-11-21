import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { POST_MEDIA_FILE_COLUMNS, reclaimMediaRowBytes, type PostMediaByteRemover } from './posts/reclaimPostMediaBytes';
import { accountSeatIdBatches } from './participants/accountParticipantIds';

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
): Promise<{ deleted: number; complete: boolean }> {
  let deleted = 0;
  let complete = true;

  // #20129 — `uploadedBy` porte DEUX espaces de clés pour les lignes écrites
  // avant #20113 : l'identité de compte pour les quatre écrivains de
  // téléversement, le `Participant.id` pour les deux écrivains de COPIE. Une
  // purge qui n'apparie que le compte laisse donc derrière elle les médias
  // TRANSFÉRÉS par le compte qu'on efface.
  //
  // Les sièges arrivent PAGINÉS, et le drapeau `complete` voyage avec eux : la
  // lecture plafonnée qui tenait ce rôle tronquait en SILENCE au-delà de son
  // plafond, et son échec rendait une liste vide sous un `warn` annonçant un
  // rejeu qui n'existe pas. Détail et mesure : le producteur unique.
  //
  // `failedIds` est tenu pour la PASSE entière, pas par fournée de sièges :
  // l'identité du compte figure dans CHAQUE fournée, donc une pièce de l'espace
  // nominal appartient à toutes, et la retenir par fournée la faisait retenter
  // autant de fois qu'il y a de fournées.
  const failedIds = new Set<string>();

  for await (const seats of accountSeatIdBatches(prisma, userId)) {
    if (!seats.complete) complete = false;
    deleted += await purgeAttachmentsOfOwners(
      prisma,
      attachmentRemover,
      [userId, ...seats.ids],
      batchSize,
      failedIds,
    );
  }

  return { deleted, complete };
}

async function purgeAttachmentsOfOwners(
  prisma: PrismaClient,
  attachmentRemover: DeletedAccountAttachmentRemover,
  owners: readonly string[],
  batchSize: number,
  failedIds: Set<string>,
): Promise<number> {
  let deleted = 0;

  for (;;) {
    const batch = await prisma.messageAttachment.findMany({
      where: {
        uploadedBy: { in: [...owners] },
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
      select: { id: true, ...POST_MEDIA_FILE_COLUMNS },
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
): Promise<{ attachmentsDeleted: number; postMediaDeleted: number; complete: boolean }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const attachments = await purgeAttachments(prisma, attachmentRemover, userId, batchSize);
  const postMediaDeleted = await purgePostMedia(prisma, mediaService, userId, batchSize);

  if (attachments.complete) {
    log.info('deleted-account media purged', { userId, attachmentsDeleted: attachments.deleted, postMediaDeleted });
  } else {
    // Pas un `warn` : ce sont des octets d'un compte supprimé qui RESTENT, et
    // aucune passe ne reviendra les chercher — `processAccountDeletionRequests`
    // n'élit que les demandes `CONFIRMED`, et celle-ci ne l'est plus (#20139).
    log.error('deleted-account media purge INCOMPLETE — seats partly unread, bytes left behind', {
      userId,
      attachmentsDeleted: attachments.deleted,
      postMediaDeleted,
    });
  }
  return { attachmentsDeleted: attachments.deleted, postMediaDeleted, complete: attachments.complete };
}
