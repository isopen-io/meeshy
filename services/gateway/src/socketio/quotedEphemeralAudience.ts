import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { withSealedQuote } from '../services/messaging/servedQuotedMessage';
import { loadQuoteCascadeAudience } from '../services/messaging/quoteCascade';

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
 * #8630 — la chaîne ENTIÈRE : un message cité qui cite lui-même un éphémère
 * mort pour B est mort pour B, et la réponse qui le cite aussi. La variante
 * ({@link sealedQuoteVariant}) tue la réponse pour ces lecteurs.
 *
 * L'auteur du message cité n'y figure jamais : sa règle reste la sienne.
 *
 * Une lecture qui échoue rend une audience VIDE — la même règle que la liste
 * (`loadEphemeralReaderDeadlines`) : sans échéance connue, la citation est
 * servie comme au lecteur dont le décompte n'a pas démarré.
 */
export async function loadSealedQuoteAudience(
  prisma: Pick<PrismaClient, 'message' | 'messageStatusEntry'>,
  quoted: QuotedEphemeralSubject | null | undefined,
  now: Date = new Date(),
): Promise<ReadonlyMap<string, Date>> {
  return loadQuoteCascadeAudience(prisma, quoted?.id, now);
}

/** La charge que reçoit la room personnelle `key` : scellée — réponse morte — si le lecteur est échu. */
export function sealedQuoteVariant<T extends object>(audience: ReadonlyMap<string, Date>, key: string, payload: T): T {
  const sealedAt = audience.get(key);
  return sealedAt ? withSealedQuote(payload, sealedAt) : payload;
}
