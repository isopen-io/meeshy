import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const en = {
  'onboarding.profile.title': 'Show yourself',
  'onboarding.profile.body': 'A face and a banner: people recognize you faster.',
  'onboarding.profile.addBanner': 'Add a banner',
  'onboarding.profile.pickBanner': 'Choose a banner',
  'onboarding.profile.pickAvatar': 'Choose a profile photo',
  'onboarding.profile.failed': 'Your image wasn’t saved.',
  'onboarding.profile.retry': 'Try again',
} as const satisfies OnboardingProfileCatalog;

export default en;
