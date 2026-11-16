import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from '../../utils/prisma-unset';
import type { EphemeralExpiryEntry } from '../EphemeralRecipientExpiryService';

export type SenderBurnPrisma = Pick<PrismaClient, 'messageStatusEntry'>;

export interface SenderBurnParams {
  readonly messageId: string;
  readonly conversationId: string;
  /** `Participant.id` de l'auteur du message. */
  readonly senderParticipantId: string;
  /** `max D(u)` — l'instant où le dernier destinataire a vu puis quitté. */
  readonly at: Date;
}

/**
 * LE FEU ANNONCÉ À L'EXPÉDITEUR EST UNE ÉCHÉANCE, ET ELLE SE GRAVE (#18556).
 *
 * Quand le dernier destinataire a vu puis quitté, l'expéditeur voit sa
 * flamme-œil brûler. L'annonce seule ne suffisait pas : aucune porte de lecture
 * ne savait qu'elle avait eu lieu, et le message revenait entier au
 * rechargement, une heure durant. L'auteur reçoit donc SA ligne
 * `MessageStatusEntry`, à l'échéance `max D(u)` : il devient un lecteur comme
 * les autres pour toutes les portes qui servent `D(lecteur)` — pierre tombale,
 * aperçu, sortie de contenu, citations — et pour le balayage par lecteur, qui
 * rattrape une annonce perdue.
 *
 * WRITE-ONCE : la ligne n'est gravée que si l'auteur n'a pas encore d'échéance.
 * Le gagnant de la gravure est le seul à annoncer ; un rejeu rend `null`.
 * L'auteur peut déjà porter une ligne (vue unique qu'il a ouverte lui-même) :
 * elle est complétée, jamais doublée.
 */
export async function claimSenderBurn(
  prisma: SenderBurnPrisma,
  params: SenderBurnParams,
): Promise<EphemeralExpiryEntry | null> {
  const { messageId, conversationId, senderParticipantId: participantId, at } = params;
  const engrave = async () =>
    (
      await prisma.messageStatusEntry.updateMany({
        where: { messageId, participantId, ...unsetOrNull('ephemeralExpiresAt') },
        data: { ephemeralExpiresAt: at },
      })
    )?.count ?? 0;

  let engraved = (await engrave()) > 0;
  if (!engraved) {
    const existing = await prisma.messageStatusEntry.findFirst({
      where: { messageId, participantId },
      select: { id: true },
    });
    if (existing) return null;
    try {
      await prisma.messageStatusEntry.create({
        data: { messageId, conversationId, participantId, ephemeralExpiresAt: at },
      });
      engraved = true;
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
      engraved = (await engrave()) > 0;
    }
  }
  if (!engraved) return null;

  const entry = (await prisma.messageStatusEntry.findFirst({
    where: { messageId, participantId },
    select: { id: true, messageId: true, conversationId: true, participantId: true, ephemeralExpiresAt: true },
  })) as EphemeralExpiryEntry | null;
  return entry?.ephemeralExpiresAt instanceof Date ? entry : null;
}
