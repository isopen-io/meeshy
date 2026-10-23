/**
 * Le double Prisma PARTAGÉ des suites du moteur de packs (#9141, LP0 #10148).
 *
 *   sticker-packs.test.ts                  le comportement de `/sticker-packs` (assertions d'avant LP0, inchangées)
 *   sticker-packs-frozen-responses.test.ts les réponses de `/sticker-packs` figées à l'octet
 *   packs-engine.test.ts                   le moteur : domaines, compteur atomique, diffusion, cadres
 *
 * Il REFUSE ce que le vrai client refuse : une seconde ligne `UserStickerPack`
 * sous le même `(userId, packSlug)` lève `P2002` (l'index unique posé par
 * `2026-10-01-schema-indexes.mongodb.js`), un slug de pack pris aussi, et un
 * filtre qu'il ne sait pas lire LÈVE au lieu de tout laisser passer — un double
 * qui accepte un argument impossible rend vert le test qu'il sert.
 *
 * Il lit les formes que le moteur écrit : égalité, `null`, `{ in }`,
 * `{ not: null }`, `{ isSet: false }` et `OR` — l'idiome Mongo d'un champ
 * nullable qui peut aussi être ABSENT (`packages/shared/CLAUDE.md`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type Row = Record<string, unknown> & { id: string };

type Where = Record<string, unknown>;

const isOperator = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

function fieldMatches(row: Row, key: string, expected: unknown): boolean {
  const actual = row[key];
  if (!isOperator(expected)) {
    if (expected === null) return actual === null;
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    return actual === expected;
  }
  return Object.entries(expected).every(([operator, operand]) => {
    switch (operator) {
      case 'in':
        return (operand as unknown[]).includes(actual);
      case 'not':
        if (operand === null) return actual !== null && actual !== undefined;
        return actual !== operand;
      case 'isSet':
        return operand === (key in row && actual !== undefined);
      case 'lte':
        return actual instanceof Date && operand instanceof Date && actual.getTime() <= operand.getTime();
      default:
        throw new Error(`double Prisma : opérateur « ${operator} » non modélisé sur « ${key} »`);
    }
  });
}

export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, expected]) =>
    key === 'OR' ? (expected as Where[]).some((branch) => matches(row, branch)) : fieldMatches(row, key, expected),
  );
}

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

export function memoryPrisma() {
  const packs: Row[] = [];
  const items: Row[] = [];
  const choices: Row[] = [];
  let seq = 0;
  const nextId = () => `68b00000000000000000${String((seq += 1)).padStart(4, '0')}`;

  const withItems = (pack: Row) => ({
    ...pack,
    items: items.filter((i) => i.packId === pack.id).sort((a, b) => (a.position as number) - (b.position as number)),
  });
  const sortBy = (rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return rows;
    const [[key, dir]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
    const value = (r: Row) => (r[key] instanceof Date ? (r[key] as Date).getTime() : (r[key] as number));
    return [...rows].sort((a, b) => (dir === 'asc' ? value(a) - value(b) : value(b) - value(a)));
  };

  const stickerPack = {
    findMany: async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) =>
      sortBy(packs.filter((p) => matches(p, where)), orderBy).map(withItems),
    findUnique: async ({ where }: { where: Where }) => {
      const found = packs.find((p) => matches(p, where));
      return found ? withItems(found) : null;
    },
    count: async ({ where }: { where: Where }) => packs.filter((p) => matches(p, where)).length,
    create: async ({ data }: { data: Record<string, unknown> & { items: { create: Record<string, unknown>[] } } }) => {
      if (packs.some((p) => p.slug === data.slug)) throw uniqueViolation();
      const { items: nested, ...rest } = data;
      const pack: Row = { reviewNote: null, installCount: 0, ...rest, id: nextId() };
      packs.push(pack);
      nested.create.forEach((item) => items.push({ zones: null, ...item, id: nextId(), packId: pack.id }));
      return withItems(pack);
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const i = packs.findIndex((p) => p.id === where.id);
      const patch = Object.fromEntries(
        Object.entries(data).map(([k, v]) =>
          v !== null && typeof v === 'object' && 'increment' in (v as object) ? [k, (packs[i][k] as number) + (v as { increment: number }).increment] : [k, v],
        ),
      );
      packs[i] = { ...packs[i], ...patch } as Row;
      return withItems(packs[i]);
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const i = packs.findIndex((p) => p.id === where.id);
      const [removed] = packs.splice(i, 1);
      items.splice(0, items.length, ...items.filter((it) => it.packId !== where.id));
      return removed;
    },
  };

  const sameKey = (row: Row, userId: unknown, packSlug: unknown) => row.userId === userId && row.packSlug === packSlug;

  const userStickerPack = {
    findMany: async ({ where }: { where: Where }) => choices.filter((c) => matches(c, where)),
    findUnique: async ({ where }: { where: { userId_packSlug: { userId: string; packSlug: string } } }) =>
      choices.find((c) => sameKey(c, where.userId_packSlug.userId, where.userId_packSlug.packSlug)) ?? null,
    upsert: async ({ where, create, update }: { where: { userId_packSlug: { userId: string; packSlug: string } }; create: Row; update: Row }) => {
      const key = where.userId_packSlug;
      const i = choices.findIndex((c) => sameKey(c, key.userId, key.packSlug));
      if (i === -1) {
        const row = { ...create, id: nextId() } as Row;
        choices.push(row);
        return row;
      }
      choices[i] = { ...choices[i], ...update } as Row;
      return choices[i];
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hit = choices.map((c, i) => [c, i] as const).filter(([c]) => matches(c, where));
      hit.forEach(([c, i]) => {
        choices[i] = { ...c, ...data } as Row;
      });
      return { count: hit.length };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (choices.some((c) => sameKey(c, data.userId, data.packSlug))) throw uniqueViolation();
      const row = { ...data, id: nextId() } as Row;
      choices.push(row);
      return row;
    },
  };

  return { prisma: { stickerPack, userStickerPack } as unknown as PrismaClient, packs, items, choices };
}
