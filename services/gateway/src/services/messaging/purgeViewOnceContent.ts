import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { unsetOrNull } from '../../utils/prisma-unset';
import { eraseSharedTranslations, type SharedTranslationErasureClient } from './sharedTranslationErasure';
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
 *
 * Elle efface aussi les traductions PARTAGÉES du message (#9899) : la table
 * voisine de `Message.translations` gardait la version scellée d'un contenu que
 * la purge venait de détruire. Cette purge n'appelle pas
 * `applyMessageRemovalEffects` (aucun `deletedAt`, la bulle reste) : l'effacement
 * lui incombe, UNE requête pour toute la passe.
 */

/** Une passe purge au plus ce nombre de messages. */
const DEFAULT_PURGE_BATCH = 200;

export interface ViewOncePurgeAttachmentRemover {
  deleteAttachment(attachmentId: string, options?: { readonly requireBytesGone?: boolean }): Promise<void>;
}

export type ViewOncePurgePrisma = Pick<PrismaClient, 'message'>;

export interface PurgedViewOnce {
  readonly id: string;
  readonly conversationId: string;
}

/**
 * Le JOURNAL d'une ligne écrite par la purge (#11269) : combien de pièces elle
 * visait, si des fichiers restent à reprendre, et s'il s'agit de la première
 * purge du contenu ou d'une reprise des seuls fichiers.
 */
export interface ViewOncePurgeEntry {
  readonly id: string;
  readonly conversationId: string;
  readonly attachments: number;
  readonly filesPending: boolean;
  readonly firstPurge: boolean;
}

export interface PurgeViewOnceOptions {
  readonly now: Date;
  readonly attachmentRemover: ViewOncePurgeAttachmentRemover;
  readonly announce?: (purged: PurgedViewOnce) => void | Promise<void>;
  readonly onPurged?: (entry: ViewOncePurgeEntry) => void;
  readonly batchSize?: number;
  readonly onError?: (messageId: string, err: unknown) => void;
}

type DueViewOnce = {
  id: string;
  conversationId: string;
  viewOnceBurnedAt?: Date | null;
  attachments: Array<{ id: string }>;
};

/**
 * Les pièces du message sont-elles TOUTES parties ? Relu en base, jamais déduit
 * des promesses d'effacement : `deleteAttachment` lève aussi sur une ligne déjà
 * partie (une passe concurrente), et réussit sans dire si ses `unlink` ont pris.
 * Une relecture qui échoue répond « non » — la purge ne prétend jamais avoir
 * effacé ce qu'elle n'a pas su compter.
 */
async function attachmentsGone(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  messageId: string,
): Promise<boolean> {
  try {
    return (await prisma.messageAttachment.count({ where: { messageId } })) === 0;
  } catch {
    return false;
  }
}

/**
 * Ce qu'une pièce RESTANTE (octets en reprise, audit F2) dit encore de son
 * contenu : transcription, traductions, légendes, nom d'origine, empreinte
 * visuelle, métadonnées. La ligne ne garde que la CLÉ du fichier, pour la
 * reprise. `originalName` est requis au schéma : vidé, jamais `null`.
 * Best-effort : la passe suivante rejoue.
 */
const DERIVED_CONTENT_ERASURE = {
  originalName: '',
  transcription: null,
  translations: null,
  caption: null,
  captionTranslations: null,
  alt: null,
  altTranslations: null,
  thumbHash: null,
  metadata: null,
} as const;

async function forgetDerivedContent(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  messageId: string,
  onError: PurgeViewOnceOptions['onError'],
): Promise<void> {
  try {
    await prisma.messageAttachment.updateMany({ where: { messageId }, data: DERIVED_CONTENT_ERASURE });
  } catch (err) {
    onError?.(messageId, err);
  }
}

type PurgedContent = {
  readonly content: '';
  readonly encryptedContent: null;
  readonly encryptionMetadata: null;
  readonly translations: null;
  readonly metadata: null;
  readonly viewOnceBurnAt: Date | null;
};

/**
 * Écrit la purge et rend `true` si CETTE passe a posé l'estampille — la seule
 * qui annonce (#11269, F5). L'estampille se pose par une écriture CONDITIONNÉE
 * à son absence : deux passes concurrentes qui ont toutes deux lu « pas encore
 * purgée » ne gagnent pas toutes deux, et `message:view-once-purged` ne part
 * qu'une fois. Une ligne déjà estampillée (reprise des fichiers) s'écrit sans
 * elle, et garde la date d'origine.
 */
async function writePurge(
  prisma: ViewOncePurgePrisma,
  message: DueViewOnce,
  data: PurgedContent,
  now: Date,
): Promise<boolean> {
  if (!(message.viewOnceBurnedAt instanceof Date)) {
    const stamped = await prisma.message.updateMany({
      where: { id: message.id, ...unsetOrNull('viewOnceBurnedAt') },
      data: { ...data, viewOnceBurnedAt: now },
    });
    if (stamped.count > 0) return true;
  }
  await prisma.message.update({ where: { id: message.id }, data });
  return false;
}

export async function purgeDueViewOnceContent(
  prisma: ViewOncePurgePrisma & Pick<PrismaClient, 'messageAttachment'> & SharedTranslationErasureClient,
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
    select: { id: true, conversationId: true, viewOnceBurnedAt: true, attachments: { select: { id: true } } },
    orderBy: { viewOnceBurnAt: 'asc' },
    take: options.batchSize ?? DEFAULT_PURGE_BATCH,
  })) as DueViewOnce[];

  const purgedIds: string[] = [];
  let firstPurges = 0;
  try {
    for (const message of due) {
      // Les fichiers d'abord. Une pièce qui résiste laisse l'échéance PASSÉE
      // (#11269) : la loi du porteur continue de refuser ses octets, et la
      // passe suivante la reprend. La remettre à `null` rendait la pièce de
      // nouveau lisible, et plus aucune passe ne la revoyait.
      // `requireBytesGone` (audit F1) : une pièce dont un octet survit (EBUSY,
      // seau muet) garde sa LIGNE, donc sa clé — c'est elle que la reprise
      // relit, et elle seule fait reconnaître le fichier comme pièce jointe.
      await Promise.allSettled(
        message.attachments.map((attachment) =>
          options.attachmentRemover.deleteAttachment(attachment.id, { requireBytesGone: true }),
        ),
      );
      const filesPending = message.attachments.length > 0 && !(await attachmentsGone(prisma, message.id));
      if (filesPending) await forgetDerivedContent(prisma, message.id, options.onError);
      let firstPurge: boolean;
      try {
        firstPurge = await writePurge(prisma, message, {
          content: '',
          encryptedContent: null,
          encryptionMetadata: null,
          translations: null,
          metadata: null,
          viewOnceBurnAt: filesPending ? options.now : null,
        }, options.now);
      } catch (err) {
        options.onError?.(message.id, err);
        continue;
      }
      purgedIds.push(message.id);
      options.onPurged?.({
        id: message.id,
        conversationId: message.conversationId,
        attachments: message.attachments.length,
        filesPending,
        firstPurge,
      });
      if (!firstPurge) continue;
      firstPurges += 1;
      try {
        await options.announce?.({ id: message.id, conversationId: message.conversationId });
      } catch (err) {
        options.onError?.(message.id, err);
      }
    }
  } finally {
    // Les traductions PARTAGÉES des seuls messages dont le contenu est vraiment
    // parti : une ligne qui a résisté garde son échéance, et la passe suivante
    // reprendra les deux. En `finally` : un rappel `onError` qui lèverait
    // interromprait la boucle, et les messages déjà purgés garderaient leur
    // version scellée jusqu'à une passe qui ne les revoit jamais (leur échéance
    // est effacée). BEST-EFFORT dans l'unité même — elle ne lève pas.
    await eraseSharedTranslations(prisma, { messageIds: purgedIds });
  }

  return { purged: firstPurges };
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

/**
 * Une flamme-œil (#8302) est éphémère par son bit 3, même si le bit
 * EPHEMERAL lui manque : l'y reconnaître garde sa destruction (`expiresAt`)
 * hors de la réévaluation « vue unique héritée », qui l'annulerait et
 * purgerait le contenu sur-le-champ (#8345).
 */
const EPHEMERAL_BITS = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

export function isLegacyViewOnceBurn(row: LegacyViewOnceBurnRow): boolean {
  const ephemeral =
    (typeof row.ephemeralDuration === 'number' && row.ephemeralDuration > 0) ||
    ((row.effectFlags ?? 0) & EPHEMERAL_BITS) !== 0;
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
