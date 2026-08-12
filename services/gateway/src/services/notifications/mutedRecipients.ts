import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationLogger } from '../../utils/logger-enhanced';

/**
 * GW3 — per-conversation mute, single rule site.
 *
 * Removes from `userIds` every recipient whose
 * `UserConversationPreferences.isMuted` is true for `conversationId`.
 *
 * ## Ce qui passe par ce filtre, et ce qui le perce
 *
 * La ligne de partage n'est pas « message ou pas » mais **ambiant ou adressé**.
 *
 * | respecte le mute (AMBIANT) | perce le mute (ADRESSÉ) |
 * |---|---|
 * | `new_message`, `message_reply`, `message_reaction` | `user_mentioned` |
 * | `member_joined`, `member_removed`, `member_left` | `added_to_conversation`, `removed_from_conversation` |
 * | | `member_promoted` / `member_demoted` / `member_role_changed` |
 *
 * Mettre une conversation en sourdine dit « ne me raconte pas ce qui s'y
 * passe » — pas « ne me dis pas que j'en suis sorti ». Un événement dont le
 * destinataire est le SUJET (on l'ajoute, on le retire, son rôle change, on le
 * nomme) reste adressé et passe outre, comme la mention par convention
 * WhatsApp. Les allées et venues d'AUTRUI sont du bruit de fond : elles sont
 * d'autant plus fréquentes que la conversation est active, donc exactement le
 * cas qui a motivé le mute.
 *
 * ## Repli OUVERT quand la préférence est illisible
 *
 * Ne lève jamais : une lecture en échec rend TOUS les candidats. Le mute est
 * une préférence de confort, la notification une obligation de livraison —
 * quand on ne sait plus laquelle des deux s'applique, un ping de trop se
 * pardonne, un message jamais annoncé non. Et l'arbitrage ne se joue pas à
 * l'unité : cette porte garde cinq familles de notifications plus un éventail
 * entier, si bien qu'un incident Mongo transitoire les taisait toutes, d'un
 * coup, pour tout le monde. Même arbitrage que les trois voisins qui l'ont déjà
 * tranché et le disent : `loadNotificationPrefs` (« fail open »),
 * `_loadReadReceiptOptOuts` (« everyone stays visible »),
 * `PrivacyPreferencesService.fetchFromDatabase`.
 */
export async function filterMutedRecipients(
  prisma: PrismaClient,
  conversationId: string,
  userIds: readonly string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];

  try {
    const mutedRows = await prisma.userConversationPreferences.findMany({
      where: { conversationId, userId: { in: [...userIds] }, isMuted: true },
      select: { userId: true },
    });

    const mutedIds = new Set(mutedRows.map((row) => row.userId));
    return userIds.filter((id) => !mutedIds.has(id));
  } catch (error) {
    notificationLogger.error('Lecture du mute en échec — tous les destinataires restent notifiés', {
      error,
      conversationId,
      audienceSize: userIds.length,
    });
    return [...userIds];
  }
}
