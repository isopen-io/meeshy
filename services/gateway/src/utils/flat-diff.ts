/**
 * Le diff À PLAT de deux objets : chaque chemin pointé (`a.b.c`) dont la valeur
 * a CHANGÉ, et lui seul, sous `{ before, after }` — la forme que la console du
 * journal lit (`audit-logs-changes.ts`, « { champ: { before, after } } »).
 *
 * Les objets simples se descendent ; un tableau, une date ou une primitive est
 * une FEUILLE, comparée par sa sérialisation. Une clé présente d'un seul côté
 * vaut `null` de l'autre.
 */
export type FlatDiff = Record<string, { before: unknown; after: unknown }>;

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

export function flatDiff(before: unknown, after: unknown, prefix = '', out: FlatDiff = {}): FlatDiff {
  if (isPlain(before) && isPlain(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      flatDiff(before[key], after[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
    out[prefix || '(racine)'] = { before: before ?? null, after: after ?? null };
  }
  return out;
}
