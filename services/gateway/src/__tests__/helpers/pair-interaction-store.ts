/**
 * Un double EN MÉMOIRE de `pairInteractionDay` (l'agrégat des cercles, #13932),
 * greffé sur celui du lien (`relationStore`) et sur `user` (âge déclaré, blocages),
 * pour des témoins qui lisent l'ÉTAT obtenu.
 *
 * Ce qu'il honore, et qu'un `mockResolvedValue` ne dit pas :
 * - l'unicité de (paire, jour) : une seconde création rend `P2002` ;
 * - `update` d'une ligne ABSENTE rend `P2025` — c'est ce qui force l'enregistreur
 *   à créer, puis à reprendre quand un autre écrivain a créé entre-temps ;
 * - `{ increment: n }` sur un compteur ;
 * - `racesOnFirstCreate` : un écrivain concurrent crée la ligne JUSTE avant la nôtre.
 * Toute forme dont il ne sait rien JETTE.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';
import { findFirstHonouringWhere } from './find-first-honouring-where';
import { relationStore } from './user-relation-store';

type Row = MongoDocument;

const unsupported = (what: string): never => {
  throw new Error(`double pairInteractionDay: ${what} non supporté`);
};

const dayOf = (row: Row): number => (row.day as Date).getTime();

export function pairInteractionStore(
  seed: {
    days?: readonly Row[];
    users?: readonly Row[];
    relations?: readonly Row[];
    notifications?: readonly Row[];
    racesOnFirstCreate?: boolean;
    failCreate?: Error;
  } = {},
) {
  const base = relationStore({ relations: seed.relations });
  const state = {
    days: [...(seed.days ?? [])].map((r) => ({ ...r })) as Row[],
    users: [...(seed.users ?? [])].map((r) => ({ ...r })) as Row[],
    notifications: [...(seed.notifications ?? [])].map((r) => ({ ...r })) as Row[],
    races: seed.racesOnFirstCreate === true,
    sequence: 0,
  };
  const nextId = (): string => `dd${String(++state.sequence).padStart(22, '0')}`;
  const findKey = (key: { userLowId: string; userHighId: string; day: Date }) =>
    state.days.find((r) => r.userLowId === key.userLowId && r.userHighId === key.userHighId && dayOf(r) === key.day.getTime());

  const pairInteractionDay = {
    update: (args: { where: { userLowId_userHighId_day: { userLowId: string; userHighId: string; day: Date } }; data: Row }): Promise<Row> => {
      const found = findKey(args.where.userLowId_userHighId_day);
      if (!found) return Promise.reject(Object.assign(new Error('pairInteractionDay.update: introuvable'), { code: 'P2025' }));
      Object.entries(args.data).forEach(([column, value]) => {
        const increment = (value as { increment?: unknown } | null)?.increment;
        if (typeof increment !== 'number') return unsupported(`data.${column}`);
        found[column] = ((found[column] as number | undefined) ?? 0) + increment;
      });
      return Promise.resolve({ ...found });
    },
    create: (args: { data: Row }): Promise<Row> => {
      if (seed.failCreate) return Promise.reject(seed.failCreate);
      const { userLowId, userHighId, day } = args.data as { userLowId: string; userHighId: string; day: Date };
      if (state.races) {
        state.races = false;
        state.days.push({ id: nextId(), userLowId, userHighId, day, expiresAt: args.data.expiresAt });
      }
      if (findKey({ userLowId, userHighId, day })) {
        return Promise.reject(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
      }
      const row: Row = { id: nextId(), ...args.data };
      state.days.push(row);
      return Promise.resolve({ ...row });
    },
    findMany: (args: { where?: Row; select?: Record<string, boolean>; take?: number; orderBy?: unknown; cursor?: { id: string }; skip?: number }): Promise<Row[]> => {
      const ordered = state.days.filter((row) => matchesMongoWhere(row, args.where)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const from = args.cursor ? ordered.findIndex((row) => row.id === args.cursor?.id) + (args.skip ?? 0) : 0;
      const page = ordered.slice(from, args.take === undefined ? undefined : from + args.take);
      const keys = args.select ? Object.keys(args.select) : null;
      return Promise.resolve(page.map((row) => (keys ? Object.fromEntries(keys.map((k) => [k, row[k]])) : { ...row })));
    },
  };

  const user = {
    findFirst: (args?: unknown) => findFirstHonouringWhere(state.users)(args),
    findMany: (args: { where?: Row; select?: Record<string, boolean> }): Promise<Row[]> => {
      const keys = args.select ? Object.keys(args.select) : null;
      return Promise.resolve(
        state.users.filter((row) => matchesMongoWhere(row, args.where)).map((row) => (keys ? Object.fromEntries(keys.map((k) => [k, row[k]])) : { ...row })),
      );
    },
  };

  return {
    prisma: { ...base.prisma, pairInteractionDay, user },
    days: (): readonly Row[] => state.days.map((r) => ({ ...r })),
    relations: base.relations,
  };
}

export type PairInteractionStore = ReturnType<typeof pairInteractionStore>;
