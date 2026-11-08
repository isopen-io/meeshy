import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche allemande du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const deCommunityPosts = {
  'community.posts.tabs.label': "Inhalte der Community",
  'community.posts.tab.channels': "Unterhaltungen",
  'community.posts.tab.posts': "Beiträge",
  'community.posts.loading': "Beiträge werden geladen",
  'community.posts.empty.title': "Noch keine Beiträge",
  'community.posts.empty.body': "Die Beiträge der Community erscheinen hier.",
  'community.posts.error.title': "Die Beiträge konnten nicht geladen werden",
  'community.posts.error.offline': "Offline: Die Beiträge erscheinen, sobald das Netz zurück ist.",
  'community.posts.retry': "Erneut versuchen",
  'community.posts.loadingMore': "Weitere werden geladen",
} as const satisfies CommunityPostsCatalog;

export default deCommunityPosts;
