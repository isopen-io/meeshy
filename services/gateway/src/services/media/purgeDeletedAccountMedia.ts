import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { reclaimMediaRowBytes, type PostMediaByteRemover } from '../posts/reclaimPostMediaBytes';

const log = enhancedLogger.child({ module: 'purgeDeletedAccountMedia' });

/**
 * Suite de #3632 / #5691 — les MÉDIAS d'un compte supprimé (#5690).
 *
 * `AccountPurgeService` purge trois tables isolées ; `anonymizeDeletedAccountMessages`
 * anonymise les messages (et détruit, au passage, les pièces jointes des messages
 * qu'elle anonymise). Ce module couvre ce que les deux ne couvrent PAS : un
 * `MessageAttachment`/`PostMedia` du compte dont le PORTEUR (message déjà
 * `deletedAt` avant la purge, post jamais touché) n'est passé par aucun des deux
 * chemins ci-dessus. Même filtre que `me/export-sections.ts` (#3633), même
 * périmètre « médias » pour la cohérence RGPD export ↔ purge.
 *
 * ─── DEUX INFRASTRUCTURES, JAMAIS DUPLIQUÉES ─────────────────────────────
 *
 * `MessageAttachment` et `PostMedia` n'ont ni la même table, ni le même piège :
 * - un `MessageAttachment` peut être PARTAGÉ par plusieurs lignes (transfert,
 *   diffusion) — `AttachmentService.deleteAttachment` ne libère les octets que
 *   si plus AUCUNE autre ligne ne les référence ;
 * - un `PostMedia` peut nourrir un `Sound` qui lui SURVIT — `reclaimMediaRowBytes`
 *   ne libère les octets que si aucun `Sound` vivant ne les référence.
 *
 * Dupliquer l'une ou l'autre règle ici serait exactement l'erreur que
 * `services/gateway/CLAUDE.md` nomme « Cette entité a-t-elle une JUMELLE ? » —
 * ce module RÉUTILISE les deux services, n'en réécrit aucun.
 *
 * ─── BORNAGE ──────────────────────────────────────────────────────────────
 *
 * Un compte actif peut porter des milliers de médias : chaque fournée est un
 * `findMany` borné (`take`, jamais un `findMany` nu — `unbounded-findmany-guard`
 * ne couvre que `routes/`, mais la règle vaut ici aussi), et la boucle
 * ré-interroge tant qu'une fournée pleine est rendue.
 */

export interface DeletedAccountAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

export interface PurgeDeletedAccountMediaOptions {
  /** Lignes traitées par fournée. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * Détruit, fournée par fournée, chaque `MessageAttachment` restant du compte
 * (`uploadedBy: userId, isAnonymous: false` — même filtre que l'export RGPD).
 *
 * Best-effort par ligne (`Promise.allSettled`), comme `anonymizeOne` : une
 * pièce jointe qui résiste ne doit jamais bloquer les autres. Les lignes en
 * échec sont exclues de la fournée SUIVANTE (`notIn`) — sans quoi une même
 * ligne fautive reviendrait indéfiniment et la boucle ne progresserait jamais.
 */
export async function purgeMessageAttachmentsOfDeletedAccount(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  userId: string,
  attachmentRemover: DeletedAccountAttachmentRemover,
  options: PurgeDeletedAccountMediaOptions = {},
): Promise<{ purged: number }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const failedIds = new Set<string>();
  let purged = 0;

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

    const outcomes = await Promise.allSettled(
      batch.map((row) => attachmentRemover.deleteAttachment(row.id)),
    );

    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        purged += 1;
      } else {
        failedIds.add(batch[index].id);
      }
    });

    if (batch.length < batchSize) break;
  }

  if (failedIds.size > 0) {
    log.warn('deleted-account attachment purge: some attachments resisted deletion', {
      userId,
      failed: failedIds.size,
    });
  }

  log.info('deleted-account message attachments purged', { userId, purged });
  return { purged };
}

/**
 * Détruit, fournée par fournée, chaque `PostMedia` restant du compte
 * (`uploaderId: userId`) — octets d'abord (`reclaimMediaRowBytes`, gardé par
 * `Sound`), lignes ensuite, exactement l'ordre de `sweepPendingPostMedia`.
 *
 * Une fournée dont la garde `Sound` échoue (requête, pas fichier) REJETTE
 * volontairement — mêmes raisons que `reclaimMediaRowBytes` documente déjà :
 * détruire des lignes sans savoir ce qu'un `Sound` en dépend laisserait ses
 * octets hors de portée pour toujours. La passe suivante rejoue la fournée.
 */
export async function purgePostMediaOfDeletedAccount(
  prisma: Pick<PrismaClient, 'sound'> & {
    postMedia: Pick<PrismaClient['postMedia'], 'findMany' | 'deleteMany'>;
  },
  storage: PostMediaByteRemover,
  userId: string,
  options: PurgeDeletedAccountMediaOptions = {},
): Promise<{ purged: number; reclaimed: number }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const where = { uploaderId: userId };
  let purged = 0;
  let reclaimed = 0;

  for (;;) {
    const rows = await prisma.postMedia.findMany({
      where,
      select: { id: true, fileUrl: true, thumbnailUrl: true },
      take: batchSize,
    });

    if (rows.length === 0) break;

    reclaimed += await reclaimMediaRowBytes(prisma, storage, rows);

    const removed = await prisma.postMedia.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    purged += removed.count;

    if (rows.length < batchSize) break;
  }

  log.info('deleted-account post media purged', { userId, purged, reclaimed });
  return { purged, reclaimed };
}

export type PurgeDeletedAccountMediaSummary = {
  readonly attachmentsPurged: number;
  readonly postMediaPurged: number;
  readonly postMediaBytesReclaimed: number;
};

/** Orchestre les deux familles pour un même compte. */
export async function purgeMediaOfDeletedAccount(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'sound'> & {
    postMedia: Pick<PrismaClient['postMedia'], 'findMany' | 'deleteMany'>;
  },
  attachmentRemover: DeletedAccountAttachmentRemover,
  mediaStorage: PostMediaByteRemover,
  userId: string,
  options: PurgeDeletedAccountMediaOptions = {},
): Promise<PurgeDeletedAccountMediaSummary> {
  const { purged: attachmentsPurged } = await purgeMessageAttachmentsOfDeletedAccount(
    prisma,
    userId,
    attachmentRemover,
    options,
  );
  const { purged: postMediaPurged, reclaimed: postMediaBytesReclaimed } = await purgePostMediaOfDeletedAccount(
    prisma,
    mediaStorage,
    userId,
    options,
  );

  return { attachmentsPurged, postMediaPurged, postMediaBytesReclaimed };
}
