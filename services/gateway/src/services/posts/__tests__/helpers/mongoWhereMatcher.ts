/**
 * Évaluateur de clause `where` Prisma-sur-MongoDB, pour les témoins qui
 * doivent FAIRE TROUVER la ligne au prédicat au lieu de la leur donner.
 *
 * ─── POURQUOI ─────────────────────────────────────────────────────────────
 * Un faux `findFirst`/`findMany` stubé à `null` ne mesure rien sur un cas
 * NÉGATIF : c'est le stub qui produit le refus, jamais la garde. Mesuré sur
 * `media.delete.test.ts` — la route mutée en `where: { id }`, sans aucune
 * garde de propriété, laissait ses deux témoins négatifs VERTS.
 *
 * ─── LA SÉMANTIQUE SIMULÉE ────────────────────────────────────────────────
 * Celle de Prisma sur MongoDB, PROUVÉE en production le 2026-08-01 : un
 * prédicat `field: null` ne matche qu'un champ PRÉSENT à `null` — jamais un
 * champ ABSENT du document. Seul `{ isSet: false }` matche l'absence. Un
 * simulateur qui confond les deux ne peut voir aucun des incidents que ces
 * fichiers épinglent.
 */

export type WhereShape = {
  AND?: WhereShape[];
  OR?: WhereShape[];
} & Record<string, unknown>;

export type MongoDoc = Record<string, unknown>;

type FieldPredicate =
  | string
  | number
  | null
  | { isSet: boolean }
  | { in: readonly unknown[] }
  | { notIn: readonly unknown[] }
  | { not: null }
  | { equals: string; mode?: 'insensitive' }
  | { lt: Date }
  | { gte: Date }
  | { startsWith: string };

function fieldMatches(doc: MongoDoc, field: string, predicate: FieldPredicate): boolean {
  const present = field in doc;
  const value = doc[field];
  if (predicate !== null && typeof predicate === 'object' && !(predicate instanceof Date)) {
    if ('isSet' in predicate) return predicate.isSet === present;
    if ('in' in predicate) return present && predicate.in.includes(value);
    // `$nin` de MongoDB matche aussi un champ ABSENT ou `null` — c'est la
    // sémantique que Prisma traduit, et elle diffère de `NOT IN` en SQL.
    if ('notIn' in predicate) return !present || !predicate.notIn.includes(value);
    // `{ not: null }` exige un champ PRÉSENT et non nul.
    if ('not' in predicate) return present && value !== null;
    // `mode: 'insensitive'` — pris en charge par le connecteur MongoDB.
    if ('equals' in predicate) {
      if (!present) return false;
      return predicate.mode === 'insensitive'
        ? String(value).toLowerCase() === predicate.equals.toLowerCase()
        : value === predicate.equals;
    }
    if ('lt' in predicate) return present && (value as Date) < predicate.lt;
    if ('gte' in predicate) return present && (value as Date) >= predicate.gte;
    if ('startsWith' in predicate) return present && String(value).startsWith(predicate.startsWith);
  }
  if (predicate === null) return present && value === null;
  return present && value === predicate;
}

/** Applique la clause comme le ferait MongoDB à travers Prisma. */
export function matchesWhere(doc: MongoDoc, where: WhereShape): boolean {
  return Object.entries(where).every(([key, predicate]) => {
    if (key === 'AND') return (predicate as WhereShape[]).every((clause) => matchesWhere(doc, clause));
    if (key === 'OR') return (predicate as WhereShape[]).some((clause) => matchesWhere(doc, clause));
    // `NOT` en LISTE vaut « aucune de ces clauses » (conjonction de négations).
    if (key === 'NOT') {
      const clauses = Array.isArray(predicate) ? (predicate as WhereShape[]) : [predicate as WhereShape];
      return clauses.every((clause) => !matchesWhere(doc, clause));
    }
    return fieldMatches(doc, key, predicate as FieldPredicate);
  });
}
