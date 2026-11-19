/**
 * Un envoi de message qui n'a RIEN écrit, et que le même envoi peut rejouer —
 * conflit ou délai de transaction (audit de #19080, E3), ou clé de conversation
 * qu'on n'a pas pu créer (#19786).
 *
 * Depuis que le message chiffré et ses enveloppes s'écrivent dans une seule
 * transaction (#12548), un renvoi CONCURRENT au même `clientMessageId` ne bute
 * plus sur l'index unique (P2002, chemin de déduplication) mais sur un conflit
 * d'écriture (P2034) ; une transaction qui dépasse son délai lève P2028. Dans
 * les deux cas rien n'est écrit, et le même envoi, rejoué, aboutit ou tombe sur
 * sa déduplication : ce n'est pas un refus. Ces erreurs se servent avec un code
 * stable et un délai, jamais en « erreur interne » muette qu'un client tiendrait
 * pour définitive.
 */
import { isConversationKeyGenerationFailed } from './serverAtRest';

const UNCOMMITTED_TRANSACTION_CODES: ReadonlySet<string> = new Set(['P2034', 'P2028']);

/** Le délai, en secondes, avant de rejouer le même envoi. */
export const MESSAGE_SEND_RETRY_AFTER_SECONDS = 1;

function isUncommittedTransaction(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && UNCOMMITTED_TRANSACTION_CODES.has(code);
}

/**
 * #19786 — la famille a DEUX membres, pas un, et le second est arrivé par
 * l'autre bout : la GÉNÉRATION de la clé au repos échoue avant qu'une seule
 * ligne de message soit écrite. Le prédicat porte donc le nom de la PROPRIÉTÉ
 * qu'il décide — « rien n'est écrit, le même envoi rejoué aboutit » — et non
 * celui du seul mécanisme par lequel on l'avait d'abord rencontrée. Un nom de
 * mécanisme refuse en silence tout nouveau membre : le lot #19786 a d'abord
 * laissé le sien tomber dans la branche terminale « erreur interne » (400,
 * donc PERMANENT côté client) faute d'un prédicat qui puisse l'accueillir.
 */
export function isRetryableMessageWrite(error: unknown): boolean {
  return isConversationKeyGenerationFailed(error) || isUncommittedTransaction(error);
}
