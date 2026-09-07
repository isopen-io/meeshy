/**
 * Drapeau et couleur par langue — la projection web de `LanguageDisplay`
 * (iOS), employe par `LanguageFlagChip`.
 *
 * REPLI EXPLICITE : une langue absente du catalogue rend son CODE EN
 * CAPITALES (« JA », « WO »), jamais « ? » ni un drapeau par defaut. C'est une
 * decision iOS documentee, et elle compte pour Meeshy : les langues que ce
 * produit sert en premier — wolof, haoussa, yoruba, amharique — n'ont pas
 * toutes un drapeau evident, et leur en attribuer un faux serait pire que de
 * n'en montrer aucun.
 */
const CATALOGUE: Record<string, { drapeau: string; couleur: string; nom: string }> = {
  fr: { drapeau: '🇫🇷', couleur: '#3498db', nom: 'Francais' },
  en: { drapeau: '🇬🇧', couleur: '#e74c3c', nom: 'English' },
  es: { drapeau: '🇪🇸', couleur: '#f39c12', nom: 'Espanol' },
  pt: { drapeau: '🇵🇹', couleur: '#2ecc71', nom: 'Portugues' },
  de: { drapeau: '🇩🇪', couleur: '#9b59b6', nom: 'Deutsch' },
  ar: { drapeau: '🇸🇦', couleur: '#16a085', nom: 'العربية' },
  sw: { drapeau: '🇹🇿', couleur: '#e67e22', nom: 'Kiswahili' },
};

export function drapeau(code: string): string {
  return CATALOGUE[code]?.drapeau ?? code.toUpperCase();
}

export function couleurDeLangue(code: string): string {
  return CATALOGUE[code]?.couleur ?? 'var(--color-i400)';
}

export function nomDeLangue(code: string): string {
  return CATALOGUE[code]?.nom ?? code.toUpperCase();
}
