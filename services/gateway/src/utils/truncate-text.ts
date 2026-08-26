/**
 * Tronque un texte à `maxCodePoints` POINTS DE CODE — jamais unités de code
 * UTF-16 — puis ajoute un suffixe seulement s'il a fallu couper.
 *
 * SSOT des troncateurs d'aperçu de notification servis/persistés (bannière push,
 * traduction poussée, e-mails, aperçus reproduits). `String.prototype.substring`
 * coupe sur une frontière d'unité de code : quand la limite tombe au milieu d'une
 * paire de substituts (émoji, extensions CJK, symboles mathématiques — tout le
 * hors-BMP), elle laisse un substitut haut orphelin rendu `�`. Ce produit est
 * massivement émoji ; l'itérateur de chaîne (`Array.from`) parcourt les points de
 * code, donc une paire n'est jamais scindée.
 *
 * Parité avec `truncateMessagePreview`
 * (`routes/conversations/utils/last-message-preview.ts`) et le correctif du
 * cycle 268 sur `SecuritySanitizer.truncate`.
 *
 * @param content contenu à borner
 * @param maxCodePoints plafond, compté en points de code
 * @param ellipsis suffixe ajouté UNIQUEMENT si le contenu a été tronqué (défaut : aucun)
 */
export function truncateByCodePoints(
  content: string,
  maxCodePoints: number,
  ellipsis = '',
): string {
  const codePoints = Array.from(content);
  if (codePoints.length <= maxCodePoints) return content;
  return codePoints.slice(0, maxCodePoints).join('') + ellipsis;
}
