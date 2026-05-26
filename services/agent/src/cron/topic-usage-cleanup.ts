import type { PrismaClient } from '@meeshy/shared/prisma/client';

const RETENTION_DAYS = 30;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Supprime les logs d'usage de topics > 30 jours. Run quotidien.
 * Index `[usedAt]` couvre la requête → ~10s sur 10M logs.
 */
export async function runTopicUsageCleanup(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.agentTopicUsageLog.deleteMany({
    where: { usedAt: { lt: cutoff } },
  });
  console.log(`[TopicUsageCleanup] Deleted ${count} logs older than ${RETENTION_DAYS}d`);
  return count;
}

export function startTopicUsageCleanupCron(prisma: PrismaClient): ReturnType<typeof setInterval> {
  runTopicUsageCleanup(prisma).catch((err) => console.error('[TopicUsageCleanup] Error', err));
  return setInterval(() => {
    runTopicUsageCleanup(prisma).catch((err) => console.error('[TopicUsageCleanup] Error', err));
  }, RUN_INTERVAL_MS);
}
