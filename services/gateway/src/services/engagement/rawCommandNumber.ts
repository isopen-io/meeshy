/**
 * LIRE UN NOMBRE RENDU PAR `$runCommandRaw` (#10541).
 *
 * Une commande brute rend du JSON étendu, et un même entier y a plusieurs
 * écritures : le nombre nu (forme relâchée), ou un objet typé (forme canonique)
 * — `{ $numberLong: "779" }`, `{ $numberInt: "779" }`, `{ $numberDouble: "779" }`.
 *
 * Mesuré en production le 2026-10-13 : 616 des 675 lignes du compteur d'engagement
 * portent `points` ET `count` en `long`. Le `Long` y est la norme, pas le cas
 * d'un script. Mesuré le même jour sur un MongoDB 8.0.4 jetable, lignes semées
 * en `NumberLong` : le client Prisma du dépôt rend ces valeurs en nombres NUS.
 * Rien n'engage une version voisine à s'y tenir, et un lecteur qui n'accepterait
 * que `typeof === 'number'` lirait alors ZÉRO sans rien signaler : une reprise
 * qui ne rend rien, un crédit qui annonce zéro action, un palier calculé sur
 * `undefined`. Tout résultat brut de ce répertoire passe donc par ici.
 *
 * Rend `null` pour ce qui n'est pas un nombre fini — à l'appelant de dire ce que
 * l'illisible veut dire chez lui, jamais à cette fonction de l'appeler zéro.
 */

const TYPED_NUMBER_KEYS = ['$numberLong', '$numberInt', '$numberDouble'] as const;

const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

export function rawCommandNumber(value: unknown): number | null {
  if (typeof value === 'number') return finiteOrNull(value);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const typed = value as Record<string, unknown>;
  const key = TYPED_NUMBER_KEYS.find((candidate) => candidate in typed);
  if (key === undefined) return null;
  const written = typed[key];
  if (typeof written === 'number') return finiteOrNull(written);
  if (typeof written !== 'string' || written.trim() === '') return null;
  return finiteOrNull(Number(written));
}
