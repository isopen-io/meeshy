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

  const user = {
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      users.set(where.id, { ...(users.get(where.id) ?? {}), ...data });
      return users.get(where.id);
    },
  };

  const client: Record<string, unknown> = { ...(base.prisma as unknown as Record<string, unknown>), meeshLedger, userPackOwnership, user };
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

  return { ...base, prisma: client as unknown as PrismaClient, ledger, ownerships, grant: (userId: string, delta: number) => ledger.push({ id: nextId(), userId, delta, reason: 'grant', requestId: `grant-${seq}` }) };
}
