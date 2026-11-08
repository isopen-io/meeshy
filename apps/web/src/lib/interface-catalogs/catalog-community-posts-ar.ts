import type { CommunityPostsCatalog } from '../i18n-community-posts-catalog';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — tranche arabe du catalogue,
 * chargée avec le détail d'une communauté (`i18n-community-posts-catalog.ts`).
 */
const arCommunityPosts = {
  'community.posts.tabs.label': "محتوى المجتمع",
  'community.posts.tab.channels': "المحادثات",
  'community.posts.tab.posts': "المنشورات",
  'community.posts.loading': "جارٍ تحميل المنشورات",
  'community.posts.empty.title': "لا توجد منشورات بعد",
  'community.posts.empty.body': "ستظهر منشورات المجتمع هنا.",
  'community.posts.error.title': "تعذّر تحميل المنشورات",
  'community.posts.error.offline': "غير متصل: ستظهر المنشورات عند عودة الشبكة.",
  'community.posts.retry': "إعادة المحاولة",
  'community.posts.loadingMore': "جارٍ تحميل المزيد",
} as const satisfies CommunityPostsCatalog;

export default arCommunityPosts;
