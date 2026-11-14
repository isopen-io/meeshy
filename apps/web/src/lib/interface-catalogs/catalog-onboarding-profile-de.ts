import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const de = {
  'onboarding.profile.title': 'Zeig dich',
  'onboarding.profile.body': 'Ein Gesicht und ein Banner: Man erkennt dich schneller.',
  'onboarding.profile.addBanner': 'Banner hinzufügen',
  'onboarding.profile.pickBanner': 'Banner auswählen',
  'onboarding.profile.pickAvatar': 'Profilfoto auswählen',
  'onboarding.profile.failed': 'Dein Bild wurde nicht gespeichert.',
  'onboarding.profile.retry': 'Erneut versuchen',
} as const satisfies OnboardingProfileCatalog;

export default de;
