/**
 * LE CATALOGUE DE « MONTRE-TOI », FRANÇAIS (#17237) — la SOURCE des clés
 * `onboarding.profile.*` de la carte facultative de l'accueil qui conseille
 * une photo et une bannière. Chargé AVEC la carte (`routes/onboarding-profile.tsx`),
 * jamais avec le reste du parcours : le catalogue de l'accueil est à son
 * plafond (`budgets.json` › `interface_catalogs_onboarding`). Les six autres
 * langues portent exactement ces clés (`satisfies OnboardingProfileCatalog`).
 */
const fr = {
  'onboarding.profile.title': 'Montre-toi',
  'onboarding.profile.body': 'Un visage et une bannière : on te reconnaît plus vite.',
  'onboarding.profile.addBanner': 'Ajouter une bannière',
  'onboarding.profile.pickBanner': 'Choisir une bannière',
  'onboarding.profile.pickAvatar': 'Choisir une photo de profil',
  'onboarding.profile.failed': 'Ton image n’a pas été enregistrée.',
  'onboarding.profile.retry': 'Réessayer',
} as const;

export default fr;
