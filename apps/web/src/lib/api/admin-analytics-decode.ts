import type { ApiFailure, ApiResult } from './http';

/**
 * **LES LECTURES PRUDENTES DES STATISTIQUES D'ADMINISTRATION** (#8876, #6728) —
 * le SITE UNIQUE que partagent les trois ports (`admin-analytics`,
 * `admin-message-stats`, `admin-languages`).
 *
 * Une valeur absente ou illisible est `null`, JAMAIS zéro : un zéro fabriqué se
 * lit « aucune activité », et c'est précisément ce que l'écran ne doit pas
 * affirmer quand la passerelle n'a rien dit. La mise en mots de `null` (« — »)
 * appartient à la bibliothèque d'interprétation.
 */
export const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const nonNegative = (value: unknown): number | null => {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
};

/** Un objet — jamais un tableau, que `asRecord` (partagé) laisserait passer pour un dictionnaire. */
export const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;

export const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

export const unreadable = (what: string): ApiFailure => ({ ok: false, status: 0, error: `${what} illisible` });

/**
 * Le décodeur rend `null` quand la charge entière est inutilisable : la requête
 * a réussi mais rien de ce qu'elle porte ne se lit, ce qui n'est ni un 404 ni un
 * tableau vide — c'est un échec, avec son « Réessayer », jamais un graphique plat.
 */
export function decoded<T>(result: ApiResult<unknown>, decode: (raw: unknown) => T | null, what: string): ApiResult<T> {
  if (!result.ok) return result;
  const data = decode(result.data);
  return data === null ? unreadable(what) : { ok: true, data };
}

/** Une chaîne de requête sans valeur vide ; absente quand il n'y a aucun paramètre. */
export function withQuery(path: string, params: Readonly<Record<string, string>>): string {
  const query = new URLSearchParams(params).toString();
  return query === '' ? path : `${path}?${query}`;
}

/** Les comptes d'un dictionnaire `{ clé: nombre }`, du plus grand au plus petit (à égalité : l'ordre des clés) ; une entrée illisible est écartée. */
export function countEntries(value: unknown): readonly { readonly key: string; readonly count: number }[] {
  const record = recordOf(value);
  if (record === null) return [];
  return Object.entries(record)
    .flatMap(([key, raw]) => {
      const count = nonNegative(raw);
      return count === null ? [] : [{ key, count }];
    })
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}
