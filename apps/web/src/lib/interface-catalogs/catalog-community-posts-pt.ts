import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche portugaise du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const ptCommunityPosts = {
  'community.posts.tabs.label': "Conteúdo da comunidade",
  'community.posts.tab.channels': "Conversas",
  'community.posts.tab.posts': "Publicações",
  'community.posts.loading': "Carregando as publicações",
  'community.posts.empty.title': "Ainda sem publicações",
  'community.posts.empty.body': "As publicações da comunidade aparecerão aqui.",
  'community.posts.error.title': "Não foi possível carregar as publicações",
  'community.posts.error.offline': "Sem conexão: as publicações aparecerão quando a rede voltar.",
  'community.posts.retry': "Tentar de novo",
  'community.posts.loadingMore': "Carregando mais",
} as const satisfies CommunityPostsCatalog;

export default ptCommunityPosts;
