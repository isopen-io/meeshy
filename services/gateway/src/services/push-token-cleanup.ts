import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Supprime les jetons push inactifs, périmés ou en échec répété.
 * Extrait de `PushNotificationService.cleanupInactiveTokens` (#20590, budget
 * de taille #4426) — comportement inchangé, couvert par les tests existants
 * de `PushNotificationService.test.ts`.
 */
export async function cleanupInactiveTokens(
  prisma: PrismaClient,
  logger: { info: (message: string, meta?: Record<string, unknown>) => void },
  daysInactive: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

  const result = await prisma.pushToken.deleteMany({
    where: {
      OR: [
        // Inactive tokens not used in X days
        {
          isActive: false,
          updatedAt: { lt: cutoffDate },
        },
        // Active tokens not used in X days (stale)
        {
          lastUsedAt: { lt: cutoffDate },
        },
        // Tokens with too many failures
        {
          failedAttempts: { gte: 5 },
        },
      ],
    },
  });

  logger.info('Cleaned up inactive/stale tokens', { count: result.count });
  return result.count;
}
