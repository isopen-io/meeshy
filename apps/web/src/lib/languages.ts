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
/* LES NOMS SONT DES ENDONYMES, ACCENTUÉS (revue #5814) — « Francais »,
 * « Espanol » et « Portugues » étaient écrits sans diacritiques. Tant que ce
 * catalogue ne servait que des `title` de survol, personne ne les lisait ;
 * le sous-menu « Traduire » du menu du message (#5814) en fait des LIBELLÉS
 * de menu, et D-13 réserve la prose au français correct. */
const CATALOG: Record<string, { flag: string; color: string; name: string }> = {
  fr: { flag: '🇫🇷', color: '#3498db', name: 'Français' },
  en: { flag: '🇬🇧', color: '#e74c3c', name: 'English' },
  es: { flag: '🇪🇸', color: '#f39c12', name: 'Español' },
  pt: { flag: '🇵🇹', color: '#2ecc71', name: 'Português' },
  de: { flag: '🇩🇪', color: '#9b59b6', name: 'Deutsch' },
  ar: { flag: '🇸🇦', color: '#16a085', name: 'العربية' },
  sw: { flag: '🇹🇿', color: '#e67e22', name: 'Kiswahili' },
};

export function flag(code: string): string {
  return CATALOG[code]?.flag ?? code.toUpperCase();
}

export function languageColor(code: string): string {
  return CATALOG[code]?.color ?? 'var(--color-i400)';
}

export function languageName(code: string): string {
  return CATALOG[code]?.name ?? code.toUpperCase();
}
