import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche italienne du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const itCommunityPosts = {
  'community.posts.tabs.label': "Contenuti della community",
  'community.posts.tab.channels': "Conversazioni",
  'community.posts.tab.posts': "Post",
  'community.posts.loading': "Caricamento dei post",
  'community.posts.empty.title': "Ancora nessun post",
  'community.posts.empty.body': "I post della community appariranno qui.",
  'community.posts.error.title': "Impossibile caricare i post",
  'community.posts.error.offline': "Offline: i post appariranno quando tornerà la rete.",
  'community.posts.retry': "Riprova",
  'community.posts.loadingMore': "Caricamento di altri post",
} as const satisfies CommunityPostsCatalog;

export default itCommunityPosts;
