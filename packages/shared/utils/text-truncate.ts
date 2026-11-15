/**
 * LE DÉCOUPAGE D'UN APERÇU DE CONTENU UTILISATEUR — site unique côté services TS.
 *
 * `String.prototype.slice` compte en unités UTF-16. Une coupe qui tombe au
 * milieu d'une paire de substitution (emoji hors BMP, CJK étendu, drapeau
 * régional, caractère suivi d'un sélecteur de variante) laisse une demi-paire
 * haute ORPHELINE dans la chaîne. Elle n'est plus du texte valide : au premier
 * aller-retour UTF-8 — l'écriture en base, la sérialisation de la charge APNs —
 * elle devient `U+FFFD`, et l'utilisateur lit `�` sur son écran verrouillé.
 *
 * `sliceCodePoints` itère par POINT DE CODE (`for…of` sur une chaîne) et écarte
 * EN ENTIER le caractère qui déborderait, au lieu de le scinder. L'invariant
 * qu'attendent les bornes en aval est donc conservé : `résultat.length <= max`,
 * toujours en unités UTF-16. Une limite nulle ou négative rend `''`.
 *
 * Pur et déterministe — aucune dépendance, aucun état.
 *
 * Réf. #8754.
 */
export function sliceCodePoints(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  let out = '';
  for (const codePoint of value) {
    if (out.length + codePoint.length > max) break;
    out += codePoint;
  }
  return out;
}

/**
 * La même coupe, pour un champ NULLABLE dont l'absence doit rester une absence.
 *
 * Les appelants écrivaient `contenu?.slice(0, n)` : une chaîne absente donnait
 * `undefined`, une chaîne vide donnait `''`. Ce compagnon préserve exactement
 * cette distinction — `null` et `undefined` rendent `undefined`, `''` rend `''`
 * — pour qu'un remplacement soit un remplacement, et non un changement de
 * contrat glissé dans un correctif.
 */
export function sliceCodePointsOrUndefined(
  value: string | null | undefined,
  max: number,
): string | undefined {
  return value == null ? undefined : sliceCodePoints(value, max);
}
