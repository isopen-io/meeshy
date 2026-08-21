/**
 * SSOT anti-`$`-substitution pour les remplacements de tokens.
 *
 * `String.prototype.replace(needle, replacementString)` interprète `$$`, `$&`,
 * `` $` ``, `$'` et `$n` DANS la chaîne de remplacement — piège JS classique dès
 * que la valeur provient de données utilisateur (noms d'affichage, contenu). Le
 * *function replacer* `() => value` court-circuite cette interprétation : la valeur
 * est réinsérée VERBATIM, en conservant la sémantique première-occurrence d'un
 * needle chaîne.
 *
 * À préférer partout où l'on injecte une valeur dynamique dans un gabarit à token
 * (`replaceLiteral(template, '{sender}', userName)`).
 */
export const replaceLiteral = (haystack: string, needle: string, value: string): string =>
  haystack.replace(needle, () => value);
