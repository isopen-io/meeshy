/**
 * « Je peux refuser que Meeshy crée des Connaissances automatiquement » (#14406,
 * écart E8 de #13942 — RGPD art. 21, opposition à un traitement fondé sur
 * l'intérêt légitime).
 *
 * La préférence `privacy.autoAcquaintance` n'a PAS de défaut stocké : un défaut
 * dans un schéma de requête est une écriture, et celui-ci dépend de l'âge
 * déclaré, qui peut arriver après coup. L'absence de choix se lit ici, à
 * chaque évaluation :
 *
 *  - un choix stocké (`true` / `false`) l'emporte, à tout âge ;
 *  - sans choix : activée pour un majeur et pour un âge inconnu, DÉSACTIVÉE
 *    pour un mineur déclaré.
 *
 * Une valeur stockée qui n'est pas un booléen vaut absence de choix, jamais un
 * oui. Lue par la passerelle (`evaluateAutoAcquaintance`) ; les réglages des
 * trois clients affichent la même valeur avec la même règle.
 */
import type { DeclaredAgeClass } from './age';

export function autoAcquaintanceEnabled(params: { readonly stored: unknown; readonly ageClass: DeclaredAgeClass }): boolean {
  if (typeof params.stored === 'boolean') return params.stored;
  return params.ageClass !== 'minor';
}
