/**
 * Une écriture de message que la base n'a pas VALIDÉE, et que le même envoi
 * peut rejouer (audit de #19080, E3).
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
const UNCOMMITTED_TRANSACTION_CODES: ReadonlySet<string> = new Set(['P2034', 'P2028']);

/** Le délai, en secondes, avant de rejouer le même envoi. */
export const MESSAGE_SEND_RETRY_AFTER_SECONDS = 1;

export function isUncommittedMessageWrite(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && UNCOMMITTED_TRANSACTION_CODES.has(code);
}
