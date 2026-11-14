/**
 * LE DÉCROCHÉ SE PORTE PAR LIGNE D'APPEL (#18242 B1).
 *
 * Une réponse SDP conclut une négociation entre DEUX bouts qui ont pris part
 * à l'appel : celui qui répond (il a accepté), et l'offrant qu'il rejoint
 * (l'initiateur, ou un participant déjà en ligne qui offre à un arrivant). Un
 * appareil qui sonne garde l'offre en attente et ne répond rien
 * (`CallManager+IncomingSignal.swift`, `CallStateMachine.kt`) : il n'est
 * jamais marqué.
 *
 * L'écriture est GARDÉE : la première réponse date la ligne, une
 * renégociation n'écrit rien. Sur MongoDB, `{ answeredAt: null }` n'apparie
 * PAS un document sans la clé — or Prisma n'écrit pas un champ optionnel qu'on
 * ne lui donne pas, et aucune ligne écrite avant ce champ ne la porte : la
 * garde lit les DEUX formes de l'absence (#18242 C1, comme `leftAt`). Une
 * panne d'écriture se journalise et ne fait jamais échouer le relais.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';

export type AnsweringLine = { readonly id: string; readonly answeredAt?: Date | null };

export async function markCallParticipantsAnswered(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  lines: ReadonlyArray<AnsweringLine | null | undefined>,
  now: Date = new Date()
): Promise<void> {
  const unmarked = [...new Set(lines.flatMap((line) => (line && !line.answeredAt ? [line.id] : [])))];
  if (unmarked.length === 0) return;
  try {
    await prisma.callParticipant.updateMany({
      where: { id: { in: unmarked }, OR: [{ answeredAt: null }, { answeredAt: { isSet: false } }] },
      data: { answeredAt: now }
    });
  } catch (error) {
    logger.warn('Failed to mark call participants answered', {
      lines: unmarked,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
