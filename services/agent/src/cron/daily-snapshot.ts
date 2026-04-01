import type { PrismaClient } from '@meeshy/shared/prisma/client';

function midnightUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function runDailySnapshot(prisma: PrismaClient): Promise<number> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const snapshotDate = midnightUtc();

  const summaries = await prisma.agentConversationSummary.findMany({
    where: { updatedAt: { gte: since } },
  });

  let created = 0;

  for (const summary of summaries) {
    const roles = await prisma.agentUserRole.findMany({
      where: { conversationId: summary.conversationId },
      select: {
        userId: true,
        user: { select: { displayName: true } },
        traitSocialStyleScore: true,
        traitAssertivenessScore: true,
        traitPositivityScore: true,
        sentimentScore: true,
        engagementLevel: true,
      },
    });

    const participantSnapshots = roles.map((r: Record<string, any>) => ({
      userId: r.userId,
      displayName: r.user?.displayName ?? r.userId,
      sentimentScore: r.sentimentScore ?? null,
      engagementLevel: r.engagementLevel ?? null,
      positivityScore: r.traitPositivityScore ?? null,
      socialStyleScore: r.traitSocialStyleScore ?? null,
      assertivenessScore: r.traitAssertivenessScore ?? null,
    }));

    const messageStats = await prisma.conversationMessageStats.findUnique({
      where: { conversationId: summary.conversationId },
      select: { totalMessages: true },
    }).catch(() => null);

    const messageCountAtSnapshot = messageStats?.totalMessages ?? summary.messageCount;

    try {
      await prisma.agentAnalysisSnapshot.upsert({
        where: {
          conversationId_snapshotDate: {
            conversationId: summary.conversationId,
            snapshotDate,
          },
        },
        create: {
          conversationId: summary.conversationId,
          snapshotDate,
          overallTone: summary.overallTone,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          topTopics: summary.currentTopics,
          dominantEmotions: summary.dominantEmotions ?? [],
          messageCountAtSnapshot,
          participantSnapshots,
        },
        update: {
          overallTone: summary.overallTone,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          topTopics: summary.currentTopics,
          dominantEmotions: summary.dominantEmotions ?? [],
          messageCountAtSnapshot,
          participantSnapshots,
        },
      });
      created++;
    } catch (err) {
      console.error(`[DailySnapshot] Error creating snapshot for conv=${summary.conversationId}:`, err);
    }
  }

  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.agentAnalysisSnapshot.deleteMany({
    where: { snapshotDate: { lt: cutoff } },
  });

  if (deleted.count > 0) {
    console.log(`[DailySnapshot] Cleaned up ${deleted.count} snapshots older than 365 days`);
  }

  console.log(`[DailySnapshot] Created/updated ${created} snapshots from ${summaries.length} summaries`);
  return created;
}

export function startDailySnapshotCron(prisma: PrismaClient): ReturnType<typeof setInterval> {
  let lastRunDate = '';

  const checkAndRun = async () => {
    const now = new Date();
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    if (todayStr === lastRunDate) return;

    const currentHourUtc = now.getUTCHours();
    if (currentHourUtc !== 0) return;

    lastRunDate = todayStr;
    console.log(`[DailySnapshot] Running daily snapshot for ${todayStr}`);

    try {
      await runDailySnapshot(prisma);
    } catch (err) {
      console.error('[DailySnapshot] Cron execution failed:', err);
      lastRunDate = '';
    }
  };

  checkAndRun().catch((err) => console.error('[DailySnapshot] Initial check failed:', err));

  return setInterval(() => {
    checkAndRun().catch((err) => console.error('[DailySnapshot] Scheduled check failed:', err));
  }, 60 * 60 * 1000);
}
