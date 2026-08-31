/**
 * `lang` — CE QUI PART À CÔTÉ D'UN TEXTE RÉSOLU PAR LE PRISME (cycle 123).
 *
 * La descente du Prisme rend un texte ET la langue dans laquelle elle l'a
 * servi ; c'est la SECONDE qui doit atteindre le lecteur d'écran, faute de quoi
 * une bulle française est prononcée en phonétique anglaise. Le § 9.5 en fait un
 * gate : « `lang="xx"` sur chaque nœud dont le texte a été résolu par le Prisme
 * dans une langue ≠ `<html lang>` ».
 *
 * La règle est COMPARATIVE, pas absolue — on ne pose `lang` que là où la langue
 * servie diffère de celle du document, sinon chaque nœud porterait une
 * redondance que les lecteurs d'écran annoncent.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION VIT DANS `lib/a11y/` ET NON DANS UN ÉCRAN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Elle a d'abord vécu chez le fil, seul consommateur. La galerie de médias en a
 * fait un SECOND — et la règle de placement (B) dit ce qui arrive alors : le
 * composant (ici la règle) remonte d'un cran, dans la préoccupation qui le
 * décrit. La recopier dans le second écran aurait produit la jumelle que le
 * § 3.2 corollaire 3 interdit pour la descente elle-même : deux comparaisons
 * de langues qui divergent au premier `fr-FR`.
 */
const CANONIQUE = (langue: string): string => langue.toLowerCase().split('-')[0] ?? langue;

export const langueServie = (servie: string | null, document: string): string | null => {
  if (servie === null) return null;
  return CANONIQUE(servie) === CANONIQUE(document) ? null : servie;
};
