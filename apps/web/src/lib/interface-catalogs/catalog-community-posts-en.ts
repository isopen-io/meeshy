import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche anglaise du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const enCommunityPosts = {
  'community.posts.tabs.label': "Community content",
  'community.posts.tab.channels': "Conversations",
  'community.posts.tab.posts': "Posts",
  'community.posts.loading': "Loading posts",
  'community.posts.empty.title': "No posts yet",
  'community.posts.empty.body': "The community’s posts will appear here.",
  'community.posts.error.title': "Couldn’t load the posts",
  'community.posts.error.offline': "Offline: posts will show up when the network is back.",
  'community.posts.retry': "Try again",
  'community.posts.loadingMore': "Loading more",
} as const satisfies CommunityPostsCatalog;

export default enCommunityPosts;
