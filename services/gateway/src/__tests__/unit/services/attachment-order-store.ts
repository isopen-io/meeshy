/**
 * Double de base pour `MessageAttachment` qui EXÉCUTE les requêtes reçues
 * (#9776) : `where` (id, `id.in`, `messageId`, « non attachée »), `data`, et
 * surtout `orderBy`, avec la sémantique de MongoDB — dans un tri ascendant,
 * un champ ABSENT ou NUL se range en tête. Il ne connaît aucune règle de
 * production : il applique celle qu'on lui passe.
 */

export type StoredAttachment = {
  readonly id: string;
  readonly createdAt: Date;
  readonly messageId?: string | null;
  readonly rank?: number | null;
  readonly effectFlags?: number | null;
  readonly [key: string]: unknown;
};

type Where = {
  readonly id?: string | { readonly in: readonly string[] };
  readonly messageId?: string;
  readonly OR?: readonly Record<string, unknown>[];
};

type OrderBy = readonly Record<string, 'asc' | 'desc'>[] | Record<string, 'asc' | 'desc'>;

const isUnattached = (row: StoredAttachment) => row.messageId === null || row.messageId === undefined;

const matches = (row: StoredAttachment, where: Where): boolean => {
  const idOk =
    where.id === undefined ||
    (typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id));
  const messageOk = where.messageId === undefined || row.messageId === where.messageId;
  const unattachedOk = where.OR === undefined || isUnattached(row);
  return idOk && messageOk && unattachedOk;
};

const comparable = (value: unknown): number | string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  return value as number | string;
};

const compareBy = (key: string, direction: 'asc' | 'desc') => (a: StoredAttachment, b: StoredAttachment) => {
  const left = comparable(a[key]);
  const right = comparable(b[key]);
  const sign = direction === 'asc' ? 1 : -1;
  if (left === right) return 0;
  if (left === null) return -sign;
  if (right === null) return sign;
  return left < right ? -sign : sign;
};

const sortRows = (rows: readonly StoredAttachment[], orderBy: OrderBy | undefined) => {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((entry) =>
    Object.entries(entry) as [string, 'asc' | 'desc'][],
  );
  return [...rows].sort((a, b) =>
    keys.reduce((verdict, [key, direction]) => verdict || compareBy(key, direction)(a, b), 0),
  );
};

export function makeAttachmentStore(initial: readonly StoredAttachment[]) {
  let rows: StoredAttachment[] = initial.map((row) => ({ ...row }));

  const findMany = (args: { where: Where; orderBy?: OrderBy; take?: number }) => {
    const sorted = sortRows(rows.filter((row) => matches(row, args.where)), args.orderBy);
    return args.take === undefined ? sorted : sorted.slice(0, args.take);
  };

  const updateMany = (args: { where: Where; data: Record<string, unknown> }) => {
    const hits = rows.filter((row) => matches(row, args.where));
    rows = rows.map((row) => (hits.includes(row) ? { ...row, ...args.data } : row));
    return { count: hits.length };
  };

  // Des créations CONCURRENTES n'ont pas d'ordre : le double les fait finir à
  // REBOURS (heure et id décroissants), le pire cas pour qui s'y fierait.
  const create = (args: { data: Record<string, unknown> }) => {
    const countdown = 999 - rows.length;
    const created = {
      id: `created-${countdown}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + countdown * 1000),
      ...args.data,
    } as StoredAttachment;
    rows = [...rows, created];
    return created;
  };

  return {
    prisma: {
      messageAttachment: {
        findMany: async (args: { where: Where; orderBy?: OrderBy; take?: number }) => findMany(args),
        updateMany: async (args: { where: Where; data: Record<string, unknown> }) => updateMany(args),
        create: async (args: { data: Record<string, unknown> }) => create(args),
      },
    },
    findMany,
    row: (rowId: string) => rows.find((row) => row.id === rowId),
    all: () => rows,
  };
}
