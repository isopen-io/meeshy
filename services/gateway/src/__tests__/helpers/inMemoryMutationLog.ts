/**
 * Le VRAI `MutationLogService` sur un journal EN MÉMOIRE qui applique son index
 * unique `(userId, clientMutationId)` comme Mongo (#9603).
 *
 * Un double du service lui-même (`recordOrReturn` réécrit dans le témoin) ne
 * pourrait pas montrer ce que la réservation tranche : deux requêtes portant le
 * même cmid au même instant. Ici, la seconde bute sur la réservation de la
 * première exactement comme en production — `MutationInFlight` tant qu'elle
 * n'est pas conclue, `MutationLogDuplicate` ensuite.
 */

import { MutationLogService } from '../../services/MutationLogService';

type LogRow = {
  readonly userId: string;
  readonly clientMutationId: string;
  kind: string;
  resultId: string | null;
  createdAt: Date;
};

type CompoundWhere = { readonly userId_clientMutationId: { readonly userId: string; readonly clientMutationId: string } };

const keyOf = (userId: string, clientMutationId: string): string => `${userId}|${clientMutationId}`;
const keyOfWhere = (where: CompoundWhere): string =>
  keyOf(where.userId_clientMutationId.userId, where.userId_clientMutationId.clientMutationId);

const prismaError = (code: string): Error => Object.assign(new Error(code), { code });

export function inMemoryMutationLog() {
  const rows = new Map<string, LogRow>();
  const project = (row: LogRow, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((field) => [field, row[field as keyof LogRow] ?? null])) : { ...row };
  const mutationLog = {
    findUnique: async (args: { where: CompoundWhere; select?: Record<string, boolean> }) => {
      const row = rows.get(keyOfWhere(args.where));
      return row ? project(row, args.select) : null;
    },
    create: async (args: { data: { userId: string; clientMutationId: string; kind: string } }) => {
      const key = keyOf(args.data.userId, args.data.clientMutationId);
      if (rows.has(key)) throw prismaError('P2002');
      const row: LogRow = { ...args.data, resultId: null, createdAt: new Date() };
      rows.set(key, row);
      return { ...row };
    },
    update: async (args: { where: CompoundWhere; data: Partial<Pick<LogRow, 'kind' | 'resultId' | 'createdAt'>> }) => {
      const row = rows.get(keyOfWhere(args.where));
      if (!row) throw prismaError('P2025');
      Object.assign(row, args.data);
      return { ...row };
    },
    delete: async (args: { where: CompoundWhere }) => {
      const key = keyOfWhere(args.where);
      const row = rows.get(key);
      if (!row) throw prismaError('P2025');
      rows.delete(key);
      return { ...row };
    },
  };
  return { service: new MutationLogService({ mutationLog } as never), rows };
}
