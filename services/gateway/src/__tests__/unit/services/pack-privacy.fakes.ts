/**
 * Les doubles des témoins RGPD des packs (#10151) : une petite base EN MÉMOIRE
 * qui APPLIQUE le filtre `where` (égalité, `in`, `not`, `startsWith`, `gt`, intervalle `gte`/`lt`) et
 * la projection `select`, et un magasin de fichiers en mémoire. Un double qui
 * répondrait `{ count: n }` à toute requête passerait au vert sur un
 * `deleteMany({})` qui viderait les bibliothèques de tout le monde.
 */

export type Row = Record<string, unknown> & { id: string };

type Where = Record<string, unknown> | undefined;

function matchesField(value: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
    const op = expected as Record<string, unknown>;
    if ('in' in op) return (op.in as unknown[]).includes(value);
    if ('not' in op) return value !== op.not;
    if ('startsWith' in op) return typeof value === 'string' && value.startsWith(op.startsWith as string);
    if ('gte' in op && 'lt' in op)
      return typeof value === 'string' && value >= (op.gte as string) && value < (op.lt as string);
    if ('gt' in op) return typeof value === 'string' && value > (op.gt as string);
    throw new Error(`opérateur non simulé : ${JSON.stringify(op)}`);
  }
  return value === expected;
}

export const matches = (row: Row, where: Where): boolean =>
  !where || Object.entries(where).every(([field, expected]) => matchesField(row[field], expected));

type Select = Record<string, unknown> | undefined;

export type Tables = Record<string, { rows: Row[] }>;

function project(row: Row, select: Select, tables: Tables, relations: Relations): Record<string, unknown> {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(select).map(([field, spec]) => {
      const relation = relations[field];
      if (relation && spec && typeof spec === 'object') {
        const nested = spec as { select?: Select; orderBy?: Record<string, 'asc' | 'desc'> };
        const children = tables[relation.table].rows.filter((child) => child[relation.foreignKey] === row.id);
        return [field, sortRows(children, nested.orderBy).map((child) => project(child, nested.select, tables, {}))];
      }
      return [field, row[field]];
    }),
  );
}

function sortRows(rows: Row[], orderBy: Record<string, 'asc' | 'desc'> | undefined): Row[] {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[field] as string | number | Date;
    const right = b[field] as string | number | Date;
    return left < right ? -sign : left > right ? sign : 0;
  });
}

type Relations = Record<string, { readonly table: string; readonly foreignKey: string }>;

type FindArgs = { where?: Where; select?: Select; orderBy?: Record<string, 'asc' | 'desc'>; take?: number; skip?: number };

export type FakeDb = Record<string, unknown> & { readonly tables: Tables; readonly writes: string[] };

function model(name: string, tables: Tables, writes: string[], relations: Relations = {}) {
  const state = tables[name];
  return {
    findMany: async (args: FindArgs = {}) => {
      const filtered = sortRows(state.rows.filter((row) => matches(row, args.where)), args.orderBy);
      const skipped = filtered.slice(args.skip ?? 0);
      const taken = args.take === undefined ? skipped : skipped.slice(0, args.take);
      return taken.map((row) => project(row, args.select, tables, relations));
    },
    count: async (args: { where?: Where } = {}) => state.rows.filter((row) => matches(row, args.where)).length,
    deleteMany: async (args: { where?: Where } = {}) => {
      writes.push(`${name}.deleteMany`);
      const before = state.rows.length;
      state.rows = state.rows.filter((row) => !matches(row, args.where));
      return { count: before - state.rows.length };
    },
    updateMany: async (args: { where?: Where; data: Record<string, unknown> }) => {
      writes.push(`${name}.updateMany`);
      let count = 0;
      state.rows = state.rows.map((row) => {
        if (!matches(row, args.where)) return row;
        count += 1;
        return { ...row, ...args.data };
      });
      return { count };
    },
  };
}

/** La base des packs : choix, bibliothèque, packs proposés et leurs éléments, possessions achetées, comptes. */
export function fakePackDb(seed: Partial<Record<'userStickerPack' | 'userSticker' | 'stickerPack' | 'stickerPackItem' | 'userPackOwnership' | 'communityAppearancePack' | 'lensPack' | 'lensPackAsset' | 'user', Row[]>>): FakeDb {
  const tables: Tables = {
    userStickerPack: { rows: [...(seed.userStickerPack ?? [])] },
    userSticker: { rows: [...(seed.userSticker ?? [])] },
    stickerPack: { rows: [...(seed.stickerPack ?? [])] },
    stickerPackItem: { rows: [...(seed.stickerPackItem ?? [])] },
    userPackOwnership: { rows: [...(seed.userPackOwnership ?? [])] },
    communityAppearancePack: { rows: [...(seed.communityAppearancePack ?? [])] },
    lensPack: { rows: [...(seed.lensPack ?? [])] },
    lensPackAsset: { rows: [...(seed.lensPackAsset ?? [])] },
    user: { rows: [...(seed.user ?? [])] },
  };
  const writes: string[] = [];
  return {
    tables,
    writes,
    userStickerPack: model('userStickerPack', tables, writes),
    userSticker: model('userSticker', tables, writes),
    stickerPack: model('stickerPack', tables, writes, { items: { table: 'stickerPackItem', foreignKey: 'packId' } }),
    stickerPackItem: model('stickerPackItem', tables, writes),
    userPackOwnership: model('userPackOwnership', tables, writes),
    communityAppearancePack: model('communityAppearancePack', tables, writes),
    lensPack: model('lensPack', tables, writes),
    lensPackAsset: model('lensPackAsset', tables, writes),
    user: model('user', tables, writes),
  };
}

/** Un magasin de fichiers en mémoire : chemins relatifs à la racine des téléversements. */
export function fakeFileStore(initial: readonly string[]) {
  const files = new Set(initial);
  const removed: string[] = [];
  return {
    files,
    removed,
    store: {
      exists: async (relativePath: string) => files.has(relativePath),
      list: async (directory: string) => [...files].filter((file) => file.startsWith(`${directory}/`)).sort(),
      remove: async (relativePath: string) => {
        if (!files.has(relativePath)) return false;
        files.delete(relativePath);
        removed.push(relativePath);
        return true;
      },
    },
  };
}
