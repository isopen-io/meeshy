import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MAX_REACTIONS_PER_OBJECT } from '@meeshy/shared/utils/reaction-limit';
import { logger } from './messages-shared';

/**
 * « MES RÉACTIONS » PAR MESSAGE, en UNE requête pour toute la page (#7936).
 *
 * Ce que ce chargeur rend est `currentUserReactions` au niveau du message :
 * les emojis que le LECTEUR a posés, jamais ceux des autres. Le lecteur est
 * nommé par ses lignes `Participant` — une par conversation : la liste d'une
 * conversation en passe une, `/sync` en passe une par conversation couverte.
 * Un lecteur anonyme a lui aussi sa ligne ; sans ligne, rien n'est demandé.
 *
 * #4177 avait retiré ce calcul parce qu'il mourait à la sérialisation, faute
 * d'être déclaré au `messageSchema`. Il revient AVEC sa déclaration
 * (`packages/shared/types/api-schemas/message.ts`) — sans elle, il redeviendrait
 * une requête par page payée pour un champ qu'aucun client ne reçoit.
 *
 * `take` n'est pas arbitraire : `MAX_REACTIONS_PER_OBJECT` borne ce qu'une
 * personne peut poser sur un message, et une ligne `Participant` ne réagit
 * qu'aux messages de SA conversation.
 */
export async function loadReaderReactionsByMessage(
  prisma: PrismaClient,
  opts: { readonly messageIds: readonly string[]; readonly readerParticipantIds: readonly string[] },
): Promise<Map<string, string[]>> {
  const { messageIds, readerParticipantIds } = opts;
  const map = new Map<string, string[]>();
  if (messageIds.length === 0 || readerParticipantIds.length === 0) return map;

  try {
    const rows = await prisma.reaction.findMany({
      where: { messageId: { in: [...messageIds] }, participantId: { in: [...readerParticipantIds] } },
      select: { messageId: true, emoji: true },
      orderBy: { createdAt: 'asc' },
      take: messageIds.length * MAX_REACTIONS_PER_OBJECT,
    });
    for (const row of rows) {
      const current = map.get(row.messageId) ?? [];
      if (!current.includes(row.emoji)) map.set(row.messageId, [...current, row.emoji]);
    }
  } catch (err) {
    logger.warn('[CONVERSATIONS] Failed to load reader reactions:', err);
    return new Map();
  }
  return map;
}
