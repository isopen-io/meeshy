import type { MongoPersistence } from '../memory/mongo-persistence';

export type ActivityReport = {
  recentMessageCount: number;
  uniqueAuthors: number;
  activityScore: number;
  shouldSkip: boolean;
  reason: string;
};

export async function detectActivity(
  persistence: MongoPersistence,
  conversationId: string,
): Promise<ActivityReport> {
  const [messagesLast5Min, messagesLast10Min, authorsLast10Min] = await Promise.all([
    persistence.getRecentMessageCount(conversationId, 5, true),
    persistence.getRecentMessageCount(conversationId, 10, true),
    persistence.getRecentUniqueAuthors(conversationId, 10, true),
  ]);

  if (messagesLast5Min > 5) {
    return {
      recentMessageCount: messagesLast5Min,
      uniqueAuthors: authorsLast10Min,
      activityScore: 1.0,
      shouldSkip: true,
      reason: `Conversation very active: ${messagesLast5Min} human messages in 5min`,
    };
  }

  const messageScore = Math.min(messagesLast10Min / 10, 1.0);
  const authorScore = Math.min(authorsLast10Min / 5, 1.0);
  const activityScore = messageScore * 0.6 + authorScore * 0.4;

  return {
    recentMessageCount: messagesLast10Min,
    uniqueAuthors: authorsLast10Min,
    activityScore,
    shouldSkip: false,
    reason: `Activity score: ${activityScore.toFixed(2)} (${messagesLast10Min} human msgs, ${authorsLast10Min} human authors in 10min)`,
  };
}
