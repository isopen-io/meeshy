import type { OnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';

/** « Montre-toi » — voir `catalog-onboarding-profile-fr.ts`. */
const pt = {
  'onboarding.profile.title': 'Mostra-te',
  'onboarding.profile.body': 'Uma cara e um banner tornam o teu perfil mais visível: reconhecem-te nas sugestões, nas conversas e nas stories, e recebes mais pedidos de contacto.',
  'onboarding.profile.addBanner': 'Adicionar um banner',
  'onboarding.profile.pickBanner': 'Escolher um banner',
  'onboarding.profile.pickAvatar': 'Escolher uma foto de perfil',
  'onboarding.profile.failed': 'A tua imagem não foi guardada.',
  'onboarding.profile.retry': 'Tentar de novo',
} as const satisfies OnboardingProfileCatalog;

export default pt;
