import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { unsetOrNull } from '../../utils/prisma-unset';
import { computeViewOnceStates, type ViewOnceAudiencePrisma } from './viewOnceAudience';

/**
 * La purge du CONTENU d'une vue unique (#7578) — la bulle reste.
 *
 * Deux échéances y mènent, toutes deux écrites dans `viewOnceBurnAt` : le
 * plafond de rétention posé à l'envoi (#7450), et la grâce posée quand le
 * dernier destinataire actif a ouvert (`scheduleViewOnceBurn`). La purge
 * efface texte, chiffré, traductions, métadonnées (lieu, sticker…) et pièces
 * jointes — fichiers compris — puis estampille `viewOnceBurnedAt`.
 *
 * Elle ne pose PAS `deletedAt` et n'annonce PAS de retrait : la règle produit
 * garde « (1) · déjà ouvert » chez chacun, jusqu'à ce que l'éphémère (s'il l'est
 * aussi) ou une suppression explicite retire la bulle. L'annonce est
 * `message:view-once-purged` : « purgez le contenu, gardez la bulle ».
 */

/** Une passe purge au plus ce nombre de messages. */
const DEFAULT_PURGE_BATCH = 200;

export interface ViewOncePurgeAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

export type ViewOncePurgePrisma = Pick<PrismaClient, 'message'>;

export interface PurgedViewOnce {
  readonly id: string;
  readonly conversationId: string;
}

export interface PurgeViewOnceOptions {
  readonly now: Date;
  readonly attachmentRemover: ViewOncePurgeAttachmentRemover;
  readonly announce?: (purged: PurgedViewOnce) => void | Promise<void>;
  readonly batchSize?: number;
  readonly onError?: (messageId: string, err: unknown) => void;
}

export async function purgeDueViewOnceContent(
  prisma: ViewOncePurgePrisma,
  options: PurgeViewOnceOptions,
): Promise<{ purged: number }> {
  const due = (await prisma.message.findMany({
    where: {
      AND: [
        { viewOnceBurnAt: { isSet: true } },
        { viewOnceBurnAt: { not: null } },
        { viewOnceBurnAt: { lte: options.now } },
      ],
      ...unsetOrNull('deletedAt'),
    },
    select: { id: true, conversationId: true, attachments: { select: { id: true } } },
    orderBy: { viewOnceBurnAt: 'asc' },
    take: options.batchSize ?? DEFAULT_PURGE_BATCH,
  })) as Array<{ id: string; conversationId: string; attachments: Array<{ id: string }> }>;

  let purged = 0;
  for (const message of due) {
    // Les fichiers d'abord : si l'effacement de la ligne échoue, son échéance
    // reste posée et la passe suivante la reprend.
    await Promise.allSettled(
      message.attachments.map((attachment) => options.attachmentRemover.deleteAttachment(attachment.id)),
    );
    try {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          content: '',
          encryptedContent: null,
          encryptionMetadata: null,
          translations: null,
          metadata: null,
          viewOnceBurnAt: null,
          viewOnceBurnedAt: options.now,
        },
      });
    } catch (err) {
      options.onError?.(message.id, err);
      continue;
    }
    purged += 1;
    try {
      await options.announce?.({ id: message.id, conversationId: message.conversationId });
    } catch (err) {
      options.onError?.(message.id, err);
    }
  }

  return { purged };
}

/**
 * Les lignes qu'un ancien chemin a programmées pour DESTRUCTION par `expiresAt`
 * (#7578) : une vue unique NON éphémère n'a pas d'autre écrivain de cette
 * colonne que l'ancien `scheduleViewOnceBurn`, qui la posait dès la PREMIÈRE
 * ouverture — auteur compris.
 */
export interface LegacyViewOnceBurnRow {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly createdAt: Date;
  readonly isViewOnce?: boolean | null;
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
}

export function isLegacyViewOnceBurn(row: LegacyViewOnceBurnRow): boolean {
  const ephemeral =
    (typeof row.ephemeralDuration === 'number' && row.ephemeralDuration > 0) ||
    ((row.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.EPHEMERAL) !== 0;
  return row.isViewOnce === true && !ephemeral;
}

/**
 * Réévalue une destruction programmée à tort : l'échéance quitte `expiresAt`
 * (la bulle ne sera pas supprimée) et devient une échéance de PURGE — tout de
 * suite si tous les destinataires actifs ont vraiment ouvert, sinon au plafond
 * de rétention compté depuis l'envoi.
 */
export async function reevaluateLegacyViewOnceBurn(
  prisma: ViewOncePurgePrisma & ViewOnceAudiencePrisma,
  row: LegacyViewOnceBurnRow,
  now: Date,
): Promise<void> {
  const state = (
    await computeViewOnceStates(prisma, [{ ...row, isViewOnce: true }], null)
  ).get(row.id);
  const retentionCap = new Date(row.createdAt.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS);
  const viewOnceBurnAt = state?.isFullyConsumed ? now : retentionCap;

  await prisma.message.update({
    where: { id: row.id },
    data: { expiresAt: null, viewOnceBurnAt },
  });
}
