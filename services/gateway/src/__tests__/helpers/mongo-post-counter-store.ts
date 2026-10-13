/**
 * Un magasin de `Post` en mémoire qui reproduit la LOI de MongoDB sur les
 * compteurs — et non celle qu'on aimerait qu'il ait (#10402).
 *
 * - `post.update` / `post.updateMany` avec `{ increment: n }` suivent ce que
 *   Prisma ENVOIE réellement sur MongoDB : `$set: { f: { $add: ['$f', n] } }`.
 *   Un champ `null` ou ABSENT en ressort `null` (journal de requêtes relevé le
 *   2026-09-14, mémoire `reference_prisma_mongo_increment_is_add_and_nulls_a_missing_field`).
 * - `$runCommandRaw` évalue un pipeline de mise à jour `$set` fait de `$add`,
 *   `$ifNull`, références `'$champ'` et littéraux, avec la même propagation de
 *   `null` que le moteur.
 *
 * Un faux qui traiterait l'absence comme zéro rendrait vert le code fautif :
 * c'est exactement ce qui a laissé `impressionCount` à `null` en production.
 */

export type StoredPost = Record<string, unknown> & { readonly id: string };

type Expression = unknown;

const evaluate = (expr: Expression, doc: Record<string, unknown>): unknown => {
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return expr.slice(1).split('.').reduce<unknown>(
      (value, key) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
      doc,
    ) ?? null;
  }
  if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) return expr;
  const operator = expr as Record<string, unknown>;
  if ('$mergeObjects' in operator) {
    // Loi MongoDB : `null` est ignoré ; un opérande non document lève.
    return (operator.$mergeObjects as Expression[]).reduce<Record<string, unknown>>((merged, operand) => {
      const value = evaluate(operand, doc);
      if (value === null || value === undefined) return merged;
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error('$mergeObjects requires object inputs');
      return { ...merged, ...value };
    }, {});
  }
  if (!Object.keys(operator).some((key) => key.startsWith('$'))) {
    return Object.fromEntries(Object.entries(operator).map(([key, value]) => [key, evaluate(value, doc)]));
  }
  if ('$ifNull' in operator) {
    const [value, fallback] = operator.$ifNull as [Expression, Expression];
    const resolved = evaluate(value, doc);
    return resolved === null || resolved === undefined ? evaluate(fallback, doc) : resolved;
  }
  if ('$add' in operator) {
    const operands = (operator.$add as Expression[]).map((operand) => evaluate(operand, doc));
    if (operands.some((operand) => operand === null || operand === undefined)) return null;
    return (operands as number[]).reduce((total, operand) => total + operand, 0);
  }
  throw new Error(`mongo-post-counter-store: opérateur non pris en charge ${Object.keys(operator).join(',')}`);
};

const prismaIncrementLaw = (current: unknown, increment: number): number | null =>
  current === null || current === undefined ? null : (current as number) + increment;

export function makeMongoPostCounterStore(initial: readonly StoredPost[]) {
  const posts = new Map<string, Record<string, unknown>>(initial.map((post) => [post.id, { ...post }]));

  const applyPrismaData = (id: string, data: Record<string, unknown>) => {
    const doc = posts.get(id);
    if (!doc) return;
    for (const [field, value] of Object.entries(data)) {
      const increment = (value as { increment?: number } | null)?.increment;
      doc[field] = typeof increment === 'number' ? prismaIncrementLaw(doc[field], increment) : value;
    }
  };

  const matchesRawFilter = (doc: Record<string, unknown>, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([field, condition]) => {
      if (field === '_id') {
        const ids = ((condition as { $in?: { $oid: string }[]; $oid?: string }).$in
          ?? [condition as { $oid: string }]).map((entry) => entry.$oid);
        return ids.includes(doc.id as string);
      }
      if (condition === null) return doc[field] === null || doc[field] === undefined;
      throw new Error(`mongo-post-counter-store: filtre non pris en charge sur ${field}`);
    });

  const runCommandRaw = async (command: Record<string, unknown>) => {
    if (command.update !== 'Post') throw new Error('mongo-post-counter-store: collection inattendue');
    const updates = command.updates as { q: Record<string, unknown>; u: { $set: Record<string, Expression> }[] }[];
    for (const { q, u } of updates) {
      for (const doc of posts.values()) {
        if (!matchesRawFilter(doc, q)) continue;
        for (const stage of u) {
          const snapshot = { ...doc };
          for (const [field, expr] of Object.entries(stage.$set)) doc[field] = evaluate(expr, snapshot);
        }
      }
    }
    return { ok: 1 };
  };

  return {
    posts,
    read: (id: string) => posts.get(id),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      applyPrismaData(where.id, data);
      return posts.get(where.id);
    },
    updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
      where.id.in.forEach((id) => applyPrismaData(id, data));
      return { count: where.id.in.length };
    },
    runCommandRaw,
  };
}
