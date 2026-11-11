import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const arContactDiscovery = {
  'settings.privacy.hide_from_search': 'إخفاء رقمي وبريدي الإلكتروني',
  'settings.privacy.hide_from_search.info':
    'لن يجدك جهات اتصالك عبر رقمك أو بريدك الإلكتروني، ولن يتم إعلامهم بانضمامك.',
  'settings.privacy.hide_from_search.question': 'من لن يعثر عليّ بعد الآن؟',
  'settings.privacy.notify_contacts_on_return': 'الإعلان عن عودتي',
  'settings.privacy.notify_contacts_on_return.info':
    'يرى أصدقاؤك ومن لديهم رقمك أو بريدك الإلكتروني «كان على Meeshy مؤخرًا»، مرة واحدة على الأكثر كل 3 ساعات. ولا يحدث ذلك أبدًا إذا كانت حالة اتصالك مخفية.',
  'settings.privacy.notify_contacts_on_return.question': 'من يُبلَّغ بعودتي؟',
  'settings.notif.contact_activity': 'عودة جهة اتصال',
} satisfies ContactDiscoveryCatalogSlice;

export default arContactDiscovery;
