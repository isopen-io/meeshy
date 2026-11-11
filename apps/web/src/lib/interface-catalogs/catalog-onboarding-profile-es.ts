import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const es = {
  'onboarding.profile.title': 'Déjate ver',
  'onboarding.profile.body': 'Una cara y un banner: te reconocen más rápido.',
  'onboarding.profile.addBanner': 'Añadir un banner',
  'onboarding.profile.pickBanner': 'Elegir un banner',
  'onboarding.profile.pickAvatar': 'Elegir una foto de perfil',
  'onboarding.profile.failed': 'Tu imagen no se guardó.',
  'onboarding.profile.retry': 'Reintentar',
} as const satisfies OnboardingProfileCatalog;

export default es;
