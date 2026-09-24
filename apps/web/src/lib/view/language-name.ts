import { getLanguageInfo } from '@meeshy/shared/utils/languages';

/**
 * LE NOM PARLÉ D'UNE LANGUE — la face CADRAGE du Prisme (#5828, Q7 ;
 * `CLAUDE.md` racine § Prisme, cycle 125) : on ADRESSE le lecteur dans SA
 * langue de lecture, jamais en anglais. « Langue d'écriture : anglais »,
 * jamais « : English », pour un document en français.
 *
 * `Intl.DisplayNames` rend le nom d'une langue CADRÉ dans la locale donnée
 * (`document.documentElement.lang`, posée par le document — repli `'fr'`
 * quand l'attribut est absent). Une locale ou un code non reconnus lèvent :
 * repli sur le nom NATIF du catalogue partagé (`getLanguageInfo`), jamais un
 * code brut affiché à l'utilisateur.
 */
export function spokenLanguageName(code: string): string {
  const locale = typeof document === 'undefined' ? 'fr' : document.documentElement.lang || 'fr';
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
    const named = displayNames.of(code);
    if (named !== undefined && named !== '' && named.toLowerCase() !== code.toLowerCase()) return named;
  } catch {
    /* API absente, locale ou code non reconnus — repli ci-dessous. */
  }
  const info = getLanguageInfo(code);
  return info.nativeName ?? info.name;
}
