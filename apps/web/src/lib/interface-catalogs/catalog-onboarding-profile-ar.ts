import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const ar = {
  'onboarding.profile.title': 'أظهِر نفسك',
  'onboarding.profile.body': 'وجهٌ ولافتة: يتعرّف عليك الآخرون بسرعة أكبر.',
  'onboarding.profile.addBanner': 'أضف لافتة',
  'onboarding.profile.pickBanner': 'اختر لافتة',
  'onboarding.profile.pickAvatar': 'اختر صورة الملف الشخصي',
  'onboarding.profile.failed': 'لم تُحفظ صورتك.',
  'onboarding.profile.retry': 'أعد المحاولة',
} as const satisfies OnboardingProfileCatalog;

export default ar;
