/**
 * Âge calculé depuis une date de naissance, en années révolues.
 */
export function calculateAge(birthDate: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Majorité VÉRIFIÉE (18 ans) — fail-closed sur l'inconnu. `birthDate` absente
 * (compte n'ayant jamais renseigné sa date de naissance) rend `false`,
 * jamais `true` : pour une garde de protection des mineurs, l'ABSENCE de
 * preuve n'est pas une preuve d'âge adulte. Réservé aux décisions où une
 * majorité non prouvée doit se comporter comme une minorité (ex: précision
 * de découvrabilité géographique EXACT, #3637) — ne pas réutiliser pour un
 * affichage cosmétique qui préférerait l'inverse.
 */
export function isAdult(birthDate: Date | null | undefined, referenceDate: Date = new Date()): boolean {
  if (!birthDate) return false;
  return calculateAge(birthDate, referenceDate) >= 18;
}
