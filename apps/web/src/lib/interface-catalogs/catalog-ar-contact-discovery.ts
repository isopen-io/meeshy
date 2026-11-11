import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const arContactDiscovery = {
  'settings.privacy.hide_from_search': 'لا تقترحني على من لديهم رقمي أو بريدي الإلكتروني',
  'settings.privacy.hide_from_search.info':
    'لن يجدك جهات اتصالك عبر رقمك أو بريدك الإلكتروني، ولن يتم إعلامهم بانضمامك.',
  'settings.privacy.notify_contacts_on_return': 'أبلغ جهات اتصالي عند عودتي إلى Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'يرى أصدقاؤك ومن لديهم رقمك أو بريدك الإلكتروني «كان على Meeshy مؤخرًا»، مرة واحدة على الأكثر كل 3 ساعات. ولا يحدث ذلك أبدًا إذا كانت حالة اتصالك مخفية.',
  'settings.notif.contact_activity': 'عندما يعود أحد جهات اتصالك إلى Meeshy',
} satisfies ContactDiscoveryCatalogSlice;

export default arContactDiscovery;
