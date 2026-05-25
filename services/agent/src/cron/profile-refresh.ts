import type { PrismaClient } from '@meeshy/shared/prisma/client';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // refresh profiles older than 24h

/**
 * Re-syncs AgentUserRole → AgentGlobalProfile for users whose global profile
 * has not been touched in the last 24h. Without this loop, a user's profile
 * only refreshes when the observer happens to run a scan on a conversation
 * they participate in — which can lag for days on quiet rooms. Keeping the
 * global profile current matters because it's what auto-pickup uses to seed
 * brand-new conversations.
 */
export async function runProfileRefresh(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  // Pick the most-recently-analyzed role per user as the source of truth.
  // A user can have several roles across conversations; the freshest one
  // reflects their current observed persona best.
  const staleProfiles = await prisma.agentGlobalProfile.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { userId: true },
    take: 500,
  });

  let refreshed = 0;
  for (const { userId } of staleProfiles) {
    const role = await prisma.agentUserRole.findFirst({
      where: { userId, messagesAnalyzed: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
      select: {
        personaSummary: true,
        tone: true,
        vocabularyLevel: true,
        typicalLength: true,
        emojiUsage: true,
        catchphrases: true,
        topicsOfExpertise: true,
        topicsAvoided: true,
        responseTriggers: true,
        commonEmojis: true,
        reactionPatterns: true,
        messagesAnalyzed: true,
        confidence: true,
        locked: true,
      },
    });
    if (!role) continue;

    try {
      await prisma.agentGlobalProfile.update({
        where: { userId },
        data: {
          personaSummary: role.personaSummary || null,
          tone: role.tone || null,
          vocabularyLevel: role.vocabularyLevel || null,
          typicalLength: role.typicalLength || null,
          emojiUsage: role.emojiUsage || null,
          catchphrases: role.catchphrases,
          topicsOfExpertise: role.topicsOfExpertise,
          topicsAvoided: role.topicsAvoided,
          responsePatterns: role.responseTriggers,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
          locked: role.locked,
        },
      });
      refreshed++;
    } catch (err) {
      console.error(`[ProfileRefresh] Error refreshing profile for user=${userId}:`, err);
    }
  }

  console.log(`[ProfileRefresh] Refreshed ${refreshed} stale profiles (scanned ${staleProfiles.length})`);
  return refreshed;
}

export function startProfileRefreshCron(prisma: PrismaClient): ReturnType<typeof setInterval> {
  // First run after a 5 min boot delay — avoids piling onto the startup spike.
  setTimeout(() => {
    runProfileRefresh(prisma).catch((err) => console.error('[ProfileRefresh] Initial run failed:', err));
  }, 5 * 60 * 1000);

  return setInterval(() => {
    runProfileRefresh(prisma).catch((err) => console.error('[ProfileRefresh] Scheduled run failed:', err));
  }, REFRESH_INTERVAL_MS);
}
