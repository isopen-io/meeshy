/**
 * Le double Prisma de la boutique unifiée (#10632) : celui du moteur des packs
 * (`sticker-packs.harness.ts`) plus le registre de Meeshes, la possession et
 * `$transaction` — avec le RETOUR ARRIÈRE d'une transaction qui lève, sans quoi
 * « possession + installation + dépense dans la même transaction » ne se
 * démontre pas. Il refuse ce que le vrai client refuse : la clé unique
 * `(userId, requestId)` du registre et `(userId, packKey)` de la possession.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { matches, memoryPrisma, type Row } from './sticker-packs.harness';

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

export function appearancePrisma() {
  const base = memoryPrisma();
  const ledger: Row[] = [];
  const ownerships: Row[] = [];
  const users = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const nextId = () => `68c00000000000000000${String((seq += 1)).padStart(4, '0')}`;

  const meeshLedger = {
    findUnique: async ({ where }: { where: { userId_requestId: { userId: string; requestId: string } } }) =>
      ledger.find((line) => line.userId === where.userId_requestId.userId && line.requestId === where.userId_requestId.requestId) ?? null,
    aggregate: async ({ where }: { where: { userId: string } }) => ({
      _sum: { delta: ledger.filter((line) => line.userId === where.userId).reduce((sum, line) => sum + (line.delta as number), 0) },
    }),
    count: async ({ where }: { where: { userId: string; reason: string } }) => ledger.filter((line) => matches(line, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (ledger.some((line) => line.userId === data.userId && line.requestId === data.requestId)) throw uniqueViolation();
      const row = { ...data, id: nextId() } as Row;
      ledger.push(row);
      return row;
    },
  };

  const userPackOwnership = {
    findUnique: async ({ where }: { where: { userId_packKey: { userId: string; packKey: string } } }) =>
      ownerships.find((row) => row.userId === where.userId_packKey.userId && row.packKey === where.userId_packKey.packKey) ?? null,
    findMany: async ({ where }: { where: { userId: string } }) => ownerships.filter((row) => row.userId === where.userId),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (ownerships.some((row) => row.userId === data.userId && row.packKey === data.packKey)) throw uniqueViolation();
      const row = { ...data, id: nextId() } as Row;
      ownerships.push(row);
      return row;
    },
  };

  const communityRows: Row[] = [];
  const sortCommunity = (rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return rows;
    const [[key, dir]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
    const value = (row: Row) => (row[key] instanceof Date ? (row[key] as Date).getTime() : (row[key] as number));
    return [...rows].sort((a, b) => (dir === 'asc' ? value(a) - value(b) : value(b) - value(a)));
  };
  // Le vrai client ne rend que les colonnes demandées : `contractReads` compte les lectures qui ramènent le contrat (jusqu'à 256 Ko).
  const reads = { contract: 0 };
  type Select = Record<string, boolean> | undefined;
  const project = (row: Row | undefined, select: Select): Row | null => {
    if (row === undefined) return null;
    if (select === undefined || select.contractJson === true) reads.contract += 1;
    return select === undefined ? row : (Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true)) as Row);
  };
  const communityAppearancePack = {
    findMany: async ({ where, orderBy, select }: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'>; select?: Select }) =>
      sortCommunity(communityRows.filter((row) => matches(row, where)), orderBy).map((row) => project(row, select) as Row),
    findUnique: async ({ where, select }: { where: { domain_slug: { domain: string; slug: string } }; select?: Select }) =>
      project(communityRows.find((row) => row.domain === where.domain_slug.domain && row.slug === where.domain_slug.slug), select),
    findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Select }) => project(communityRows.find((row) => matches(row, where)), select),
    count: async ({ where }: { where: Record<string, unknown> }) => communityRows.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (communityRows.some((row) => row.domain === data.domain && row.slug === data.slug)) throw uniqueViolation();
      const row = { reviewNote: null, reviewerId: null, reviewedAt: null, price: null, installCount: 0, ...data, id: nextId() } as Row;
      communityRows.push(row);
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = communityRows.findIndex((row) => row.id === where.id);
      return communityRows.splice(index, 1)[0];
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = communityRows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    update: async ({ where, data, select }: { where: { id: string }; data: Record<string, unknown>; select?: Select }) => {
      const row = communityRows.find((candidate) => candidate.id === where.id) as Row;
      const patch = Object.fromEntries(Object.entries(data).map(([key, value]) => (value !== null && typeof value === 'object' && 'increment' in (value as object) ? [key, (row[key] as number) + (value as { increment: number }).increment] : [key, value])));
      Object.assign(row, patch);
      return project(row, select);
    },
  };

  const user = {
    findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      users.set(where.id, { ...(users.get(where.id) ?? {}), ...data });
      return users.get(where.id);
    },
  };

  // Les lens (#11271) : aucune lens dans ce double — la vitrine et le magasin des fichiers les lisent quand même.
  const lensPack = { findMany: async () => [], findUnique: async () => null, findFirst: async () => null };
  const lensPackAsset = { findMany: async () => [] };
  const client: Record<string, unknown> = { ...(base.prisma as unknown as Record<string, unknown>), meeshLedger, userPackOwnership, user, communityAppearancePack, lensPack, lensPackAsset };
  const snapshot = () => ({ ledger: [...ledger], ownerships: [...ownerships], choices: [...base.choices] });
  client.$transaction = async (work: (tx: unknown) => Promise<unknown>) => {
    const before = snapshot();
    try {
      return await work(client);
    } catch (error) {
      ledger.splice(0, ledger.length, ...before.ledger);
      ownerships.splice(0, ownerships.length, ...before.ownerships);
      base.choices.splice(0, base.choices.length, ...before.choices);
      throw error;
    }
  };

  return { ...base, prisma: client as unknown as PrismaClient, ledger, ownerships, communityRows, contractReads: () => reads.contract, grant: (userId: string, delta: number) => ledger.push({ id: nextId(), userId, delta, reason: 'grant', requestId: `grant-${seq}` }) };
}
