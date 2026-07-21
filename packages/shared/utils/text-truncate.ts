/**
 * Source unique (côté services TS) du **découpage de texte par point de code**.
 *
 * Avant cette itération, la troncature des aperçus de contenu utilisateur
 * (corps de push, sous-titres de notification, aperçus de réaction, snapshots
 * de réponse) passait par `String.prototype.substring` / `slice`, qui opèrent
 * sur les **unités UTF-16**. Une coupe tombant au milieu d'une paire de
 * substitution (emoji hors BMP, CJK étendu, drapeaux régionaux…) laissait une
 * demi-paire haute isolée (`\uD83C`) rendue en glyphe cassé `�` — livrée telle
 * quelle sur l'écran verrouillé de TOUTES les plateformes (iOS/Android/web).
 *
 * `sliceCodePoints` prend au plus `max` **unités UTF-16** depuis le début de
 * `value` sans JAMAIS scinder une paire de substitution : un caractère astral
 * qui déborderait la limite est écarté en entier. L'invariant
 * `result.length <= max` (unités UTF-16) est préservé — les bornes en aval
 * (payload APNs, colonnes DB) restent respectées.
 *
 * Même doctrine que `apps/web/utils/truncate.ts` (`sliceCodePoints`, iter 187)
 * et que le découpage par point de code de `initials.ts`. Pur et déterministe.
 */
export function sliceCodePoints(value: string, max: number): string {
  if (max <= 0) return '';
  let out = '';
  for (const cp of value) {
    if (out.length + cp.length > max) break;
    out += cp;
  }
  return out;
}
