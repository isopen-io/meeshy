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

type Identity = string | null | undefined;
type BufferedSignal = { readonly type: string; readonly from: string } | undefined;

/**
 * QUI UNE RÉPONSE SDP MARQUE : celui qui répond, et l'offrant seulement si
 * SON offre (ou son redémarrage ICE) vers le répondant attend dans le tampon
 * du répondant — lu AVANT toute purge. Une offre d'un AUTRE offrant dans ce
 * tampon ne marque pas la cible (#18242 R1 : C répond à B pendant que l'offre
 * de A attend chez C). La même lecture sert la réponse relayée et la réponse
 * mise en tampon faute de socket chez l'offrant (R4).
 */
export function answeringLines<L>(input: {
  readonly answerer: { readonly ids: ReadonlyArray<Identity>; readonly line: L };
  readonly offerer: { readonly ids: ReadonlyArray<Identity>; readonly line: L };
  readonly bufferedSignalFor: (slot: string) => BufferedSignal;
}): ReadonlyArray<L> {
  const offerKnown = input.answerer.ids.some((slot) => {
    const signal = slot ? input.bufferedSignalFor(slot) : undefined;
    return !!signal && (signal.type === 'offer' || signal.type === 'ice-restart') && input.offerer.ids.includes(signal.from);
  });
  return offerKnown ? [input.answerer.line, input.offerer.line] : [input.answerer.line];
}

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
