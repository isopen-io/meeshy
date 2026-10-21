/**
 * « NIVEAU N ATTEINT » — le push `level_up` dit le niveau du JEU (#10901), celui que le bloc `game` sert au même
 * instant (`levelFromScore` sur la poche, sous le plafond du rang et des étapes), et les étincelles qui l'ont porté.
 *
 * Il ne part que quand le record du CYCLE monte (`GloryService.creditLevelProgress`, écriture conditionnelle) : le niveau
 * baisse à la frappe puis remonte, et cette remontée n'est pas une montée. Un seul push par crédit — le plus haut niveau
 * atteint, jamais un par niveau franchi.
 *
 * Le service de notifications est celui du processus (`getSharedNotificationService`), monté avec le serveur temps
 * réel : un script ou un test qui recalcule des niveaux ne pousse rien. Une panne ne retient jamais le record.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { tierReachedNotification } from '@meeshy/shared/utils/tier-reached-notification';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ENGAGEMENT_ROUTE } from '../engagement/engagementRoute';

const log = enhancedLogger.child({ module: 'GameLevelUpNotifier' });

export type LevelReached = {
  readonly userId: string;
  /** Le niveau du jeu atteint — le nouveau record du cycle. */
  readonly level: number;
  /** La poche d'étincelles qui l'a porté. */
  readonly sparks: number;
};

export function gameLevelUpNotifier(prisma: Pick<PrismaClient, 'user'>): (event: LevelReached) => Promise<void> {
  return async ({ userId, level, sparks }) => {
    const notifications = getSharedNotificationService();
    if (notifications === undefined) return;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const banner = tierReachedNotification(recipientLanguage(user, 'fr'), { kind: 'level', level, sparks });
      if (banner === null) return;
      await notifications.createNotification({
        userId,
        type: 'level_up',
        priority: 'normal',
        title: banner.title,
        content: banner.body,
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, level, tierRank: banner.rank, value: banner.value },
      });
    } catch (error) {
      log.warn('level_up notification failed after the level record was written', {
        userId,
        level,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
