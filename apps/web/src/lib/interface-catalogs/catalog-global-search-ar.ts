import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, ARABE (#14619, #14620). */
const ar = {
  'section.messages': 'الرسائل',
  'search.title': 'بحث',
  'search.placeholder': 'رسائل، منشورات، أشخاص',
  'search.label': 'البحث في كل مكان',
  'search.clear': 'مسح البحث',
  'search.back': 'رجوع',
  'search.everywhere': 'البحث في كل مكان',
  'search.hint': 'اكتب حرفين على الأقل',
  'search.loading': 'جارٍ البحث',
  'search.loadMore': 'عرض المزيد',
  'search.retry': 'إعادة المحاولة',
  'search.error': 'تعذّر إتمام البحث',
  'search.offline': 'غير متصل — سيُستأنف البحث عند عودة الشبكة',
  'tab.messages': 'الرسائل',
  'tab.posts': 'المنشورات',
  'tab.people': 'الأشخاص',
  'messages.empty': 'لا توجد رسالة مطابقة',
  'posts.empty': 'لا يوجد منشور مطابق',
  'people.empty': 'لا أحد مطابق',
  'type.post': 'منشور',
  'type.reel': 'ريل',
  'type.story': 'قصة',
  'translated': 'مترجم',
  'message.blurred': 'رسالة مموّهة',
} as const satisfies GlobalSearchCatalog;

export default ar;
