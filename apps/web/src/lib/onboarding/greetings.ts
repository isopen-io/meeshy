import { translateOnboarding, type OnboardingCatalogKey } from '@/lib/i18n-onboarding-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LES HUIT SALUTS D'UNE LANGUE (#7729, § 5 du parcours) — lus dans le catalogue
 * de l'accueil, dans l'ordre. Le tirage (`greetingDraft`, `journey.ts`) en
 * choisit un au hasard : Meeshy Global ne voit pas vingt fois la même phrase.
 */
const TEMPLATE_KEYS = [
  'onboarding.global.template.1',
  'onboarding.global.template.2',
  'onboarding.global.template.3',
  'onboarding.global.template.4',
  'onboarding.global.template.5',
  'onboarding.global.template.6',
  'onboarding.global.template.7',
  'onboarding.global.template.8',
] as const satisfies readonly OnboardingCatalogKey[];

export const GREETING_COUNT = TEMPLATE_KEYS.length;

export const greetingTemplates = (language: InterfaceLanguage): readonly string[] =>
  TEMPLATE_KEYS.map((key) => translateOnboarding(language, key, { name: '{name}', languages: '{languages}' }));
