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
  /**
   * Les conversations que la lecture parcourt — la portée de la réparation.
   *
   * Une liste STATIQUE quand l'appelant la connaît déjà (elle vient d'un
   * paramètre de route, d'une appartenance résolue). Un RÉSOLVEUR quand elle
   * ne l'est pas — un message trouvé par id seul, sans savoir à l'avance dans
   * quelle(s) conversation(s) il vit : le résolveur n'est appelé qu'APRÈS
   * l'échec de `read()`, et il DOIT lire sans jamais sélectionner `sender`,
   * sous peine de répéter l'erreur qu'il est censé diagnostiquer.
   */
  readonly conversationIds: readonly string[] | (() => Promise<readonly string[]>);
};

/**
 * Rejoue UNE fois une lecture de messages qu'un expéditeur disparu a fait
 * rejeter, après avoir réparé la portée qu'elle lit.
 *
 * - Toute autre erreur est relancée telle quelle : le 500 d'une panne reste un
 *   500, et rien n'est réparé à son sujet.
 * - Une portée résolue VIDE (le résolveur n'a rien trouvé — le message a déjà
 *   disparu autrement) ne répare rien : la réparation avec une liste vide est
 *   un no-op documenté (`repairOrphanedMessageSenders`), et le rejeu échoue de
 *   nouveau sans boucler, comme toute réparation sans effet.
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
      const conversationIds =
        typeof scope.conversationIds === 'function' ? await scope.conversationIds() : scope.conversationIds;
      const repaired = await repairOrphanedMessageSenders(scope.prisma, { conversationIds });
      log.warn('a message read hit a sender that no longer exists — repaired, replaying once', {
        conversationIds,
        ...repaired,
      });
    } catch (repairError) {
      log.error('orphaned sender repair failed — the read keeps its error', {
        error: repairError instanceof Error ? repairError.message : String(repairError),
      });
      throw error;
    }

    return read();
  }
}

/**
 * Le résolveur PARTAGÉ pour la forme la plus commune de portée inconnue : une
 * lecture qui cherche un ou plusieurs messages par ID SEUL, sans savoir à
 * l'avance dans quelle(s) conversation(s) ils vivent (#6516) — une route
 * `/messages/:messageId` sans `:conversationId` dans son chemin, un lot de
 * messages transférés dont les sources peuvent appartenir à des conversations
 * différentes.
 *
 * La lecture qu'il fait est délibérément PAUVRE : seul `conversationId`, sans
 * jamais `sender` — la répéter avec la même sélection que l'appelant
 * reproduirait l'erreur qu'elle est censée diagnostiquer. Une ligne dont l'id
 * n'existe plus (l'appelant demandait un message déjà purgé) n'apporte
 * simplement aucune conversation à la portée.
 */
export function discoverConversationIdsByMessageIds(
  prisma: PrismaClient,
  messageIds: readonly string[]
): () => Promise<readonly string[]> {
  return async () => {
    if (messageIds.length === 0) return [];
    const rows = await prisma.message.findMany({
      where: { id: { in: [...messageIds] } },
      select: { conversationId: true },
    });
    return [...new Set(rows.map((row) => row.conversationId))];
  };
}
