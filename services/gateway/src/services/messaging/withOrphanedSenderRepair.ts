import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { repairOrphanedMessageSenders } from './repairOrphanedMessageSenders';

const log = enhancedLogger.child({ module: 'withOrphanedSenderRepair' });

/**
 * L'erreur, et elle seule, que rend une lecture Prisma tombée sur un message
 * dont le `Participant` expéditeur n'existe plus (#6501). La relation
 * `conversation` d'une participation orpheline lève la même phrase sur un AUTRE
 * champ : elle n'est pas reconnue ici, parce que ce n'est pas cette réparation
 * qui la soigne.
 */
const ORPHANED_SENDER = /Inconsistent query result: Field sender is required to return data, got `null` instead/;

export const isOrphanedSenderError = (error: unknown): boolean =>
  error instanceof Error && ORPHANED_SENDER.test(error.message);

export type OrphanedSenderReadScope = {
  readonly prisma: PrismaClient;
  /** Les conversations que la lecture parcourt — la portée de la réparation. */
  readonly conversationIds: readonly string[];
};

/**
 * Rejoue UNE fois une lecture de messages qu'un expéditeur disparu a fait
 * rejeter, après avoir réparé la portée qu'elle lit.
 *
 * - Toute autre erreur est relancée telle quelle : le 500 d'une panne reste un
 *   500, et rien n'est réparé à son sujet.
 * - Une réparation qui échoue rend l'erreur d'ORIGINE, sans rejouer.
 * - Le rejeu n'est pas gardé : s'il échoue encore, son erreur remonte — jamais
 *   de boucle.
 */
export async function withOrphanedSenderRepair<T>(scope: OrphanedSenderReadScope, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isOrphanedSenderError(error)) throw error;

    try {
      const repaired = await repairOrphanedMessageSenders(scope.prisma, { conversationIds: scope.conversationIds });
      log.warn('a message read hit a sender that no longer exists — repaired, replaying once', {
        conversationIds: scope.conversationIds,
        ...repaired,
      });
    } catch (repairError) {
      log.error('orphaned sender repair failed — the read keeps its error', {
        conversationIds: scope.conversationIds,
        error: repairError instanceof Error ? repairError.message : String(repairError),
      });
      throw error;
    }

    return read();
  }
}
