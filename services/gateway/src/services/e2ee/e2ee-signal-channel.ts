/**
 * **Dans une conversation e2ee, un signal en clair est refusé** (#13142, fail-closed
 * comme #9229). Une réaction, la frappe, une suppression pour tous, une vue
 * unique consommée ou un épinglage y voyagent en messages de contrôle chiffrés,
 * par la route unique `POST /e2ee/conversations/:id/signals`. Leurs routes en
 * clair, qui feraient lire et ranger au serveur l'emoji, l'instant de lecture ou
 * le geste, y répondent `409 E2EE_SIGNAL_CHANNEL_REQUIRED` avec une phrase
 * lisible, ou se taisent pour la frappe (aucun accusé à rendre). Les modes
 * `server` et `hybrid` ne changent pas.
 *
 * Deux portées, selon ce que le geste révèle :
 * - le geste qui DIT quelque chose de neuf (l'emoji d'une réaction, l'épingle, la
 *   frappe) se juge sur le régime de la CONVERSATION ;
 * - le geste qui EFFACE (suppression pour tous, vue unique consommée) se juge sur
 *   la LIGNE du message : un message écrit en clair avant l'activation reste lu
 *   par le serveur, et sa route en clair le supprime comme avant. Le refuser
 *   rendait tout le passé en clair d'une conversation chiffrée insupprimable.
 *
 * Le refus se pose APRÈS le contrôle d'accès de chaque route : un non-membre
 * reçoit son 403 ou son 404, jamais un 409 qui lui dirait le régime.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';
import { ConflictError } from '../../errors/custom-errors';
import { isEndToEndMode, messageRowSealedFromServer } from '../messaging/e2eePlaintextAdmission';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';

export class E2eeSignalChannelRequiredError extends ConflictError {
  constructor() {
    super(E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE, E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED);
  }
}

/** La charge d'un refus, pour un accusé socket comme pour une réponse REST. */
export const SIGNAL_CHANNEL_REFUSAL = {
  error: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE,
  code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED,
} as const;

/** Le régime d'une conversation qu'on a déjà lue : refuse-t-il le geste en clair ? */
export const conversationRefusesPlainSignal = (conversation: { readonly encryptionMode?: string | null } | null | undefined): boolean =>
  isEndToEndMode(conversation?.encryptionMode);

/**
 * Supprimer pour tous ou consommer une vue unique : refusé en clair pour un
 * message dont la ligne est scellée au serveur (bout en bout, ou mode inconnu
 * d'une ligne chiffrée — fail-closed) DANS une conversation chiffrée de bout en
 * bout, seule à porter le canal des signaux. Un message lu par le serveur passe
 * sans lecture de plus ; une ligne scellée d'une conversation qui n'est pas (ou
 * plus, avant #12949) en bout en bout passe aussi : aucun signal ne la
 * supprimerait. Une conversation introuvable ou illisible refuse.
 */
export async function messageRefusesPlainErasure(
  prisma: Pick<PrismaClient, 'conversation'>,
  row: { readonly conversationId: string; readonly isEncrypted?: boolean | null; readonly encryptionMode?: string | null },
): Promise<boolean> {
  if (!messageRowSealedFromServer({ isEncrypted: row.isEncrypted, encryptionMode: row.encryptionMode })) return false;
  const conversation = await prisma.conversation
    .findUnique({ where: { id: row.conversationId }, select: { encryptionMode: true } })
    .catch(() => null);
  return conversation === null || conversationRefusesPlainSignal(conversation);
}

/**
 * Le régime d'une conversation pour un geste FRÉQUENT (la frappe), lu au plus une
 * fois par conversation : le passage en bout en bout est irréversible (#12949),
 * donc un « oui » se garde ; un « non » se relit après `negativeTtlMs`. Une
 * lecture illisible répond OUI sans être gardée : la frappe se tait sur un doute.
 */
export function createEndToEndRegimeReader(
  prisma: Pick<PrismaClient, 'conversation'>,
  options: { readonly negativeTtlMs?: number; readonly maxEntries?: number } = {},
): (conversationId: string) => Promise<boolean> {
  const endToEnd = new BoundedTtlCache<string, true>({ maxSize: options.maxEntries ?? 10_000 });
  const clear = new BoundedTtlCache<string, true>({ maxSize: options.maxEntries ?? 10_000, ttlMs: options.negativeTtlMs ?? 30_000 });
  return async (conversationId) => {
    if (endToEnd.get(conversationId)) return true;
    if (clear.get(conversationId)) return false;
    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { encryptionMode: true } });
      const sealed = conversationRefusesPlainSignal(conversation);
      (sealed ? endToEnd : clear).set(conversationId, true);
      return sealed;
    } catch {
      return true;
    }
  };
}
