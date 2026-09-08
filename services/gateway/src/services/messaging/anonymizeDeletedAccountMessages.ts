import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { AttachmentService } from '../attachments/AttachmentService';
import {
  applyMessageRemovalEffects,
  type RetractedNotificationAnnouncer,
} from './messageRemovalEffects';
import { getSharedNotificationService } from '../notifications/notification-service-registry';

const log = enhancedLogger.child({ module: 'anonymizeDeletedAccountMessages' });

/**
 * Ce que `privacy.json` promet à la fin de la période de grâce (#3632) ne
 * s'arrête pas aux tables qui n'appartiennent qu'au compte : « suppression
 * définitive de TOUTES vos données personnelles », avec trois exceptions
 * nommées — messages ANONYMISÉS (pas détruits, le fil des autres survit),
 * journaux de sécurité (90 j), facturation (obligation légale). #5688 purge
 * déjà sessions/profil vocal/liens ; cette unité couvre la classe que ces
 * trois exceptions désignent explicitement.
 *
 * `Message.senderId` référence un `Participant.id`, jamais un `User.id`
 * (cf. CLAUDE.md § authentification unifiée) — résoudre d'abord les
 * `Participant` du compte est donc la seule façon d'atteindre ses messages.
 *
 * ─── LE CINQUIÈME ÉCRIVAIN DE `deletedAt` ────────────────────────────────
 *
 * `messageRemovalEffects.ts` énumère quatre écrivains existants et prévient :
 * « aucune unité ne les reliait, et les listes avaient divergé ». Cette
 * fonction est le CINQUIÈME — elle appelle `applyMessageRemovalEffects` pour
 * chaque message, jamais un `updateMany` bâti à la main, précisément pour ne
 * pas rouvrir la même divergence (décompte des compteurs, rétraction des
 * notifications déjà poussées, désactivation des liens de partage orphelins,
 * recalcul de `lastMessageAt`).
 *
 * ─── DÉTRUIRE LE CONTENU, PAS SEULEMENT LE MASQUER ───────────────────────
 *
 * Même geste et même raison qu'`ExpiredMessagesCleanupService` : purger un
 * compte en fin de grâce est IRRÉVERSIBLE, comme une échéance d'éphémère,
 * contrairement à un « supprimer pour tout le monde » dont la sémantique
 * produit reste « retire de la vue ». `content`, `encryptedContent`,
 * `translations` et `metadata` sont donc écrasés — masquer sans effacer
 * fermerait la fuite de LECTURE en laissant intacte la fuite AU REPOS.
 *
 * `reactionSummary`/`reactionCount` sont VOLONTAIREMENT préservés : ce sont
 * des réactions d'AUTRES comptes sur ce message, pas le contenu du compte
 * purgé.
 *
 * ─── `Participant.displayName` — la décision produit ouverte de l'issue ──
 *
 * `Participant.displayName` est une copie dénormalisée par conversation,
 * distincte de `User.displayName` (anonymisé ailleurs, #5691) : la laisser
 * intacte préserverait le nom du compte purgé dans l'historique de CHAQUE
 * conversation qu'il a rejointe. Aucune des trois exceptions de `privacy.json`
 * ne couvre un nom affiché — c'est donc une donnée personnelle qui rejoint la
 * règle générale (« suppression définitive »), réécrite pour toutes les
 * lignes du compte.
 */

export interface DeletedAccountMessageAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

export interface AnonymizeDeletedAccountMessagesOptions {
  /** Messages traités par fournée. */
  batchSize?: number;
  /** Injecté par les tests ; en production c'est `AttachmentService`. */
  attachmentRemover?: DeletedAccountMessageAttachmentRemover;
}

export const DELETED_ACCOUNT_DISPLAY_NAME = 'Compte supprimé';

interface DeletedAccountMessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  metadata: unknown;
  messageType: string | null;
  attachments: Array<{ id: string; mimeType: string | null }>;
}

async function anonymizeOne(
  prisma: PrismaClient,
  message: DeletedAccountMessageRow,
  userId: string,
  attachmentRemover: DeletedAccountMessageAttachmentRemover,
  announcer: RetractedNotificationAnnouncer | undefined,
): Promise<boolean> {
  // Les fichiers d'abord — même ordre et même raison qu'`ExpiredMessagesCleanupService` :
  // si l'écriture qui suit échoue, la ligne garde `deletedAt` nul et la
  // fournée suivante la reprend ; les fichiers déjà partis ne manquent à
  // personne. Dans l'autre sens, un effacement réussi suivi d'une
  // suppression de fichier en échec laisserait le fichier orphelin pour
  // toujours (la ligne ne redeviendrait plus jamais éligible).
  if (message.attachments.length > 0) {
    await Promise.allSettled(
      message.attachments.map((attachment) => attachmentRemover.deleteAttachment(attachment.id)),
    );
  }

  try {
    await prisma.message.update({
      where: { id: message.id },
      data: {
        content: '',
        encryptedContent: null,
        translations: null,
        metadata: null,
        deletedAt: new Date(),
      },
    });
  } catch (err) {
    log.warn('deleted-account message anonymize failed', { messageId: message.id, err });
    return false;
  }

  try {
    await applyMessageRemovalEffects(
      prisma,
      {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: userId,
        messageType: message.messageType,
        attachmentMimeTypes: message.attachments.map((attachment) => attachment.mimeType ?? ''),
        content: message.content,
        metadata: message.metadata,
      },
      announcer,
    );
  } catch (err) {
    // `applyMessageRemovalEffects` est déjà best-effort effet par effet ; ce
    // filet ne couvre que l'imprévu. Le contenu est détruit — c'est
    // l'invariant qui compte, et il ne se défait pas.
    log.warn('deleted-account message removal effects failed', { messageId: message.id, err });
  }

  return true;
}

/**
 * Anonymise les messages d'un compte supprimé, dans TOUTES les conversations
 * où il a jamais participé, et réécrit son nom affiché. Best-effort de bout
 * en bout — appelée depuis un balayage de maintenance ; un message ou une
 * pièce jointe qui résiste ne doit jamais empêcher la reprise des autres.
 */
export async function anonymizeMessagesOfDeletedAccount(
  prisma: PrismaClient,
  userId: string,
  options: AnonymizeDeletedAccountMessagesOptions = {},
  announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService(),
): Promise<{ anonymized: number }> {
  const batchSize = options.batchSize ?? 200;
  const attachmentRemover = options.attachmentRemover ?? new AttachmentService(prisma);

  // Pas de `take` : un compte dont la purge s'arrêterait à mi-liste laisserait
  // certaines de ses conversations non anonymisées sans qu'aucun signal ne le
  // dise — même choix que `processAccountDeletionRequests.accountDeletionRequest.findMany`,
  // dans le même balayage.
  const participants = await prisma.participant.findMany({
    where: { userId },
    select: { id: true },
  });

  let anonymized = 0;

  if (participants.length > 0) {
    const participantIds = participants.map((participant) => participant.id);
    // Exclut, pour la durée de CET appel, les lignes dont l'écriture a déjà
    // échoué — `deletedAt: null` seul les laisserait éligibles pour
    // toujours et boucler la fournée sans jamais progresser.
    const failedIds = new Set<string>();

    for (;;) {
      const batch = await prisma.message.findMany({
        where: {
          senderId: { in: participantIds },
          deletedAt: null,
          ...(failedIds.size > 0 ? { id: { notIn: [...failedIds] } } : {}),
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          // Capturés AVANT l'effacement : `applyMessageRemovalEffects` en a
          // besoin pour les `m+<token>` du contenu et le décompte des
          // compteurs de conversation.
          content: true,
          metadata: true,
          messageType: true,
          attachments: { select: { id: true, mimeType: true } },
        },
        take: batchSize,
      });

      if (batch.length === 0) break;

      for (const message of batch) {
        const ok = await anonymizeOne(prisma, message, userId, attachmentRemover, announcer);
        if (ok) {
          anonymized += 1;
        } else {
          failedIds.add(message.id);
        }
      }

      if (batch.length < batchSize) break;
    }
  }

  // Réécrit le nom affiché sur TOUTES les lignes du compte, y compris celles
  // des conversations sans aucun message vivant à anonymiser.
  await prisma.participant.updateMany({
    where: { userId, displayName: { not: DELETED_ACCOUNT_DISPLAY_NAME } },
    data: { displayName: DELETED_ACCOUNT_DISPLAY_NAME },
  });

  log.info('deleted-account messages anonymized', { userId, anonymized });
  return { anonymized };
}
