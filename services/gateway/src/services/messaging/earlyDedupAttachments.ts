import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { AttachmentService } from '../attachments';
import { MESSAGE_ATTACHMENT_ORDER } from '../attachments/attachmentOrder';

/**
 * LE REJEU QUI APPORTE DES PIÈCES NEUVES (#19917).
 *
 * Le dédoublonnage précoce de `MessagingService.handleMessage` rend la ligne
 * existante et s'arrête là — AVANT `handleAttachments`. Les `attachmentIds`
 * du rejeu, que les deux transports viennent pourtant d'ADMETTRE (vivantes, à
 * l'expéditeur, non attachées : `admitMessageAttachments` côté REST,
 * `admitLoadedMessageAttachments` côté WS, tous deux AVANT de composer leur
 * `messageRequest`), n'étaient liés par personne.
 *
 * **Pourquoi un message existant peut n'avoir aucune pièce.** Le dépôt l'écrit
 * lui-même, vingt lignes au-dessus du site fautif
 * (`MessageProcessor.handleAttachments`, § copie) : la liaison des pièces
 * pré-téléversées vit sous un `catch` qui JOURNALISE et ne relève pas. Un
 * envoi dont elle a échoué laisse une bulle sans elles, et « un rejeu au même
 * `clientMessageId` rendrait ensuite `success: true` ». L'expéditeur voit
 * « envoyé » avec ses aperçus LOCAUX ; la pièce n'existe pour personne, et
 * elle part au balayage des orphelines (24–48 h). C'est le `catch` qui crée
 * cet état — il est instruit par #19956, pas ici.
 *
 * **Ce que ce site fait, et ce qu'il refuse de faire.** Il LIE ce que
 * l'appelant a déjà admis, et seulement quand le message existant ne porte
 * AUCUNE pièce — le rejeu nominal (le message porte déjà les siennes) ne
 * déclenche rien, et une pièce déjà attachée ne se déplace jamais : le lien
 * lui-même ne vise que les lignes dont `messageId` est absent ou nul
 * (`associateAttachmentsToMessage`, #9587). Il n'invente aucune admission :
 * un id qui n'aurait pas franchi la porte de son transport n'arrive pas ici.
 *
 * Le rang suit l'ordre du composeur, comme à l'envoi nominal, et la relecture
 * trie par `MESSAGE_ATTACHMENT_ORDER` : une réponse de dédup qui rendrait les
 * pièces dans un autre ordre que le `message:new` des autres destinataires
 * recréerait l'écart que #9776 a fermé.
 */
export type DedupHitWithAttachments = {
  readonly id: string;
  readonly attachments?: readonly unknown[] | null;
  /** Non nul ⇒ la ligne est SUPPRIMÉE : rien ne s'y attache (voir ci-dessous). */
  readonly deletedAt?: Date | null;
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly effectFlags?: number;
  readonly maxViewOnceCount?: number | null;
};

export type EarlyDedupAttachmentPrisma = Pick<PrismaClient, 'messageAttachment'>;

/**
 * Rend les pièces à SERVIR sur la réponse de dédup, ou `null` quand il n'y a
 * rien à faire — `null` dit « ne touche pas à ce que tu as », jamais « il n'y
 * en a pas » (la distinction du § « un champ que le client lit
 * AUTORITATIVEMENT » de `CLAUDE.md` : rendre `[]` ferait effacer les pièces
 * que la ligne porte déjà).
 */
export async function linkAdmittedAttachmentsToDedupHit(
  prisma: EarlyDedupAttachmentPrisma,
  params: {
    readonly hit: DedupHitWithAttachments;
    readonly attachmentIds?: readonly string[];
  },
): Promise<readonly unknown[] | null> {
  const { hit, attachmentIds } = params;
  if (attachmentIds === undefined || attachmentIds.length === 0) return null;
  if ((hit.attachments?.length ?? 0) > 0) return null;
  /**
   * UNE LIGNE SUPPRIMÉE NE REÇOIT RIEN. Le dédoublonnage n'a AUCUN filtre sur
   * `deletedAt` (mesuré : il rend un message supprimé avec `success: true`,
   * #19957) — y attacher les pièces du rejeu les rendrait à la fois
   * invisibles et IMMORTELLES : le balayage des orphelines ne ramasse que les
   * lignes dont `messageId` est vide, donc les octets resteraient pour
   * toujours sous un message que personne ne lit. Ce lot ne tranche pas le
   * sort du rejeu sur un message supprimé ; il refuse seulement d'aggraver.
   */
  if (hit.deletedAt != null) return null;

  await new AttachmentService(prisma as PrismaClient).associateAttachmentsToMessage(attachmentIds, hit.id, hit);
  return prisma.messageAttachment.findMany({ where: { messageId: hit.id }, orderBy: MESSAGE_ATTACHMENT_ORDER });
}
