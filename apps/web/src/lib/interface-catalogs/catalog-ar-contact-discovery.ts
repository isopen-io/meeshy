import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const arContactDiscovery = {
  'settings.privacy.hide_from_search': 'إخفاء رقمي وبريدي الإلكتروني',
  'settings.privacy.hide_from_search.info':
    'لن يجدك جهات اتصالك عبر رقمك أو بريدك الإلكتروني، ولن يتم إعلامهم بانضمامك.',
  'settings.privacy.notify_contacts_on_return': 'الإعلان عن عودتي',
  'settings.privacy.notify_contacts_on_return.info':
    'يرى أصدقاؤك ومن لديهم رقمك أو بريدك الإلكتروني «كان على Meeshy مؤخرًا»، مرة واحدة على الأكثر كل 3 ساعات. ولا يحدث ذلك أبدًا إذا كانت حالة اتصالك مخفية.',
  'settings.notif.contact_activity': 'عودة جهة اتصال',
  'settings.notif.contact_activity.info': 'إشعار عند عودة أحد جهات اتصالك إلى Meeshy.',
  'settings.notif.bring': 'تلقي Bring',
  'settings.notif.bring.info':
    'يمكن لأحد المقرّبين أن يجعل هاتفك يرنّ في حالة طوارئ قصوى، حتى في الوضع الصامت. عند الإيقاف، لا يمكن لأحد أن يجعل هاتفك يرنّ.',
} satisfies ContactDiscoveryCatalogSlice;

export default arContactDiscovery;
