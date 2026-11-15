import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const it = {
  'onboarding.profile.title': 'Fatti vedere',
  'onboarding.profile.body': 'Un volto e un banner: ti riconoscono più in fretta.',
  'onboarding.profile.addBanner': 'Aggiungi un banner',
  'onboarding.profile.pickBanner': 'Scegli un banner',
  'onboarding.profile.pickAvatar': 'Scegli una foto profilo',
  'onboarding.profile.failed': 'La tua immagine non è stata salvata.',
  'onboarding.profile.retry': 'Riprova',
} as const satisfies OnboardingProfileCatalog;

export default it;
