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
  'viewerEngagement.viewedAt': 'Viewed at {time}',
  'viewerEngagement.onlyViewed': 'Viewed, no other interaction',
  'viewerEngagement.openProfile': 'View profile',
  'viewerEngagement.back': 'Back to views',
  'viewerEngagement.openDetail': 'See what {name} did',
  'viewerEngagement.empty.subtitle': 'People who see this post will appear here.',
  'viewerEngagement.forbidden': 'You don’t have access to the list of who viewed this post.',
  'viewerEngagement.unavailable': 'Activity details are temporarily unavailable.',
  'viewerEngagement.visitors.one': 'and {count} visitor without an account',
  'viewerEngagement.visitors.other': 'and {count} visitors without an account',
  'viewerEngagement.visitors.only.one': '{count} visitor without an account',
  'viewerEngagement.visitors.only.other': '{count} visitors without an account',
} satisfies ViewerEngagementCatalog;

export default en;
