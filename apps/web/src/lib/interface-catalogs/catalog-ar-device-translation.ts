import type { DeviceTranslationCatalogSlice } from './catalog-fr-device-translation';

/** The on-device translation (#9898) — see `catalog-fr-device-translation.ts`. */
const arDeviceTranslation = {
  'settings.device_translation': 'الترجمة على هذا الجهاز',
  'settings.device_translation.info': 'تُترجَم الرسائل هنا بنموذج يُنزَّل مرة واحدة فقط، بحجم نحو 110 ميغابايت لكل زوج من اللغات. اللغات المدعومة: الفرنسية والإنجليزية والإسبانية والبرتغالية والألمانية والإيطالية والعربية. تبقى اللغات الأخرى مترجمة من الخادم، في المحادثات غير المشفّرة من طرف إلى طرف. يُشارَك ما يترجمه هذا الجهاز مع بقية أعضاء المحادثة، ما لم تكن إيصالات القراءة معطّلة.',
} satisfies DeviceTranslationCatalogSlice;

export default arDeviceTranslation;
