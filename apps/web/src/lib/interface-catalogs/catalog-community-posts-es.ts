import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche espagnole du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const esCommunityPosts = {
  'community.posts.tabs.label': "Contenido de la comunidad",
  'community.posts.tab.channels': "Conversaciones",
  'community.posts.tab.posts': "Publicaciones",
  'community.posts.loading': "Cargando las publicaciones",
  'community.posts.empty.title': "Sin publicaciones aún",
  'community.posts.empty.body': "Las publicaciones de la comunidad aparecerán aquí.",
  'community.posts.error.title': "No se pudieron cargar las publicaciones",
  'community.posts.error.offline': "Sin conexión: las publicaciones aparecerán cuando vuelva la red.",
  'community.posts.retry': "Reintentar",
  'community.posts.loadingMore': "Cargando más",
} as const satisfies CommunityPostsCatalog;

export default esCommunityPosts;
