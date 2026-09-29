import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hasPerReaderEphemeralDeadline } from '@meeshy/shared/utils/ephemeral-countdown';
import { withSealedQuote } from '../services/messaging/servedQuotedMessage';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'quotedEphemeralAudience' });

/** Même plafond que la lecture des échéances d'une page (#4165 : aucun `findMany` nu). */
const SEALED_AUDIENCE_SCAN_CAP = 2000;

export type QuotedEphemeralSubject = {
  readonly id?: string | null;
  readonly senderId?: string | null;
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
};

/**
 * #8562 — les lecteurs pour qui le message CITÉ par une diffusion est déjà
 * échu, par clé de room personnelle (`userId ?? participantId`), avec LEUR
 * échéance.
 *
 * Une diffusion de room sert UNE charge à tous : elle ne peut pas porter
 * l'échéance d'un éphémère, qui est PAR LECTEUR (`D(u)`). Sans cette audience,
 * une réponse neuve citant une flamme-œil déjà consommée par B republiait son
 * texte à B en temps réel — le scellement n'existait que dans le cache du web,
 * et se perdait au rechargement.
 *
 * L'auteur du message cité n'y figure jamais : sa règle reste la sienne.
 *
 * Une lecture qui échoue rend une audience VIDE — la même règle que la liste
 * (`loadEphemeralReaderDeadlines`) : sans échéance connue, la citation est
 * servie comme au lecteur dont le décompte n'a pas démarré.
 */
export async function loadSealedQuoteAudience(
  prisma: Pick<PrismaClient, 'messageStatusEntry'>,
  quoted: QuotedEphemeralSubject | null | undefined,
  now: Date = new Date(),
): Promise<ReadonlyMap<string, Date>> {
  if (!quoted?.id || !hasPerReaderEphemeralDeadline(quoted)) return new Map();
  try {
    const entries = (await prisma.messageStatusEntry.findMany({
      where: { messageId: quoted.id, ephemeralExpiresAt: { lte: now } },
      select: { participantId: true, ephemeralExpiresAt: true, participant: { select: { userId: true } } },
      take: SEALED_AUDIENCE_SCAN_CAP,
    })) as Array<{ participantId: string; ephemeralExpiresAt: Date | null; participant: { userId: string | null } | null }>;
    return new Map(
      entries
        .filter((entry) => entry.ephemeralExpiresAt instanceof Date && entry.participantId !== quoted.senderId)
        .map((entry) => [entry.participant?.userId ?? entry.participantId, entry.ephemeralExpiresAt as Date] as const),
    );
  } catch (err) {
    logger.warn('sealed quote audience query failed', { messageId: quoted.id, err });
    return new Map();
  }
}

/** La charge que reçoit la room personnelle `key` : scellée si le lecteur est échu. */
export function sealedQuoteVariant<T extends object>(audience: ReadonlyMap<string, Date>, key: string, payload: T): T {
  const sealedAt = audience.get(key);
  return sealedAt ? withSealedQuote(payload, sealedAt) : payload;
}
