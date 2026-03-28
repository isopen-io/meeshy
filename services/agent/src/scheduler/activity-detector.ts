import type { MongoPersistence } from '../memory/mongo-persistence';

export type ActivityReport = {
  recentMessageCount: number;
  uniqueAuthors: number;
  activityScore: number;
  shouldSkip: boolean;
  reason: string;
};

export type ActivityOptions = {
  highActivityThreshold?: number;
  messageNormalizer?: number;
  authorNormalizer?: number;
};

export async function detectActivity(
  persistence: MongoPersistence,
  conversationId: string,
  options?: ActivityOptions,
): Promise<ActivityReport> {
  const highThreshold = options?.highActivityThreshold ?? 5;
  const msgNorm = options?.messageNormalizer ?? 10;
  const authorNorm = options?.authorNormalizer ?? 5;

  const [messagesLast5Min, messagesLast10Min, authorsLast10Min] = await Promise.all([
    persistence.getRecentMessageCount(conversationId, 5, true),
    persistence.getRecentMessageCount(conversationId, 10, true),
    persistence.getRecentUniqueAuthors(conversationId, 10, true),
  ]);

  if (messagesLast5Min > highThreshold) {
    return {
      recentMessageCount: messagesLast5Min,
      uniqueAuthors: authorsLast10Min,
      activityScore: 1.0,
      shouldSkip: true,
      reason: `Conversation very active: ${messagesLast5Min} human messages in 5min (threshold: ${highThreshold})`,
    };
  }

  const messageScore = Math.min(messagesLast10Min / msgNorm, 1.0);
  const authorScore = Math.min(authorsLast10Min / authorNorm, 1.0);
  const activityScore = messageScore * 0.6 + authorScore * 0.4;

  return {
    recentMessageCount: messagesLast10Min,
    uniqueAuthors: authorsLast10Min,
    activityScore,
    shouldSkip: false,
    reason: `Activity score: ${activityScore.toFixed(2)} (${messagesLast10Min} human msgs, ${authorsLast10Min} human authors in 10min)`,
  };
}
