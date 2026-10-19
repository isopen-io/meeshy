/**
 * LE CATALOGUE DU DÉCOR DE PROFIL, FRANÇAIS (#10632) — la SOURCE des clés
 * `profileDecor.*` : les entrées « Bannière » et « Contour » du profil, la
 * feuille de choix et ses refus. Chargé avec la feuille
 * (`i18n-profile-decor-catalog.ts`), jamais au démarrage.
 */
const frProfileDecor = {
  'profileDecor.banner.entry': "Bannière",
  'profileDecor.ring.entry': "Contour",
  'profileDecor.frame.entry': "Cadre de la bannière",
  'profileDecor.banner.title': "Bannière du profil",
  'profileDecor.ring.title': "Contour de l’avatar",
  'profileDecor.frame.title': "Cadre de la bannière",
  'profileDecor.none': "Aucun",
  'profileDecor.photo': "Photo",
  'profileDecor.shop': "Plus dans la boutique",
  'profileDecor.refused': "Ce choix n’est pas disponible pour votre compte. Il reste comme avant.",
  'profileDecor.error': "Enregistrement impossible. Le choix précédent est conservé.",
} as const;

export default frProfileDecor;
