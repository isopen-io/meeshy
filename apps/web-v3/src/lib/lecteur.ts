/**
 * LE PRISME DU LECTEUR — l'ordre de descente, expose en une constante tant que
 * le POC n'a pas de session.
 *
 * L'ordre REEL est celui de `resolveUserLanguage()` : systemLanguage,
 * regionalLanguage, customDestinationLanguage, puis la locale de l'appareil en
 * QUATRIEME rang. La locale n'est pas un repli : elle concourt a son rang, et
 * ne supplante jamais les preferences configurees dans l'application.
 *
 * Le POC place la locale du navigateur au dernier rang pour que la descente ait
 * plus d'un echelon a parcourir — un prisme d'une seule langue rendrait vert
 * n'importe quel resolveur, juste ou faux.
 */
const localeAppareil = typeof navigator === 'undefined' ? 'en' : (navigator.language.split('-')[0] ?? 'en');

export const LANGUES_DU_LECTEUR: readonly string[] = [...new Set(['fr', localeAppareil])];
