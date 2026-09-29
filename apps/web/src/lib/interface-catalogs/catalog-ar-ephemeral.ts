import type { EphemeralCatalogSlice } from './catalog-fr-ephemeral';

/** Composer ephemeral picker (#8304) — see `catalog-fr-ephemeral.ts`. */
const arEphemeral = {
  'composer.ephemeral.afterRead': 'تختفي بعد القراءة',
  'composer.ephemeral.duration.15': '15 ثانية',
  'composer.ephemeral.duration.30': '30 ثانية',
  'composer.ephemeral.duration.60': 'دقيقة واحدة',
  'composer.ephemeral.duration.300': '5 دقائق',
  'composer.ephemeral.duration.3600': 'ساعة واحدة',
  'composer.ephemeral.duration.86400': '24 ساعة',
  'composer.ephemeral.activate': 'تفعيل الوضع المؤقت',
  'composer.ephemeral.active': 'الوضع المؤقت مفعّل: {duration}',
  'composer.ephemeral.off': 'معطّل',
  'composer.ephemeral.rail': 'المدة قبل اختفاء الرسالة',
  'composer.protection.imposed.blur': 'التمويه مفروض بسبب الرسالة المقتبسة',
  'composer.protection.imposed.ephemeral': 'الوضع المؤقت مفروض بسبب الرسالة المقتبسة: {duration}',
} satisfies EphemeralCatalogSlice;

export default arEphemeral;
