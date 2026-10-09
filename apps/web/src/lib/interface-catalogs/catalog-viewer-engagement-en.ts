/** La feuille « Vues » enrichie (#9727), ANGLAIS — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const en = {
  'viewerEngagement.shares.one': '{count} share',
  'viewerEngagement.shares.other': '{count} shares',
  'viewerEngagement.reposts.one': '{count} repost',
  'viewerEngagement.reposts.other': '{count} reposts',
  'viewerEngagement.comments.one': '{count} comment',
  'viewerEngagement.comments.other': '{count} comments',
  'viewerEngagement.replies.one': '{count} reply',
  'viewerEngagement.replies.other': '{count} replies',
  'viewerEngagement.reactions': 'Reactions: {emojis}',
  'viewerEngagement.bookmarked': 'Saved to their favorites',
  'viewerEngagement.viewedAt': 'Viewed at {time}',
  'viewerEngagement.onlyViewed': 'Viewed, no other interaction',
  'viewerEngagement.openProfile': 'View profile',
  'viewerEngagement.back': 'Back to views',
  'viewerEngagement.openDetail': 'See what {name} did',
  'viewerEngagement.empty.subtitle': 'People who see this post will appear here.',
  'viewerEngagement.forbidden': 'Only the author can see who viewed this post.',
  'viewerEngagement.unavailable': 'Activity details are temporarily unavailable.',
} satisfies ViewerEngagementCatalog;

export default en;
