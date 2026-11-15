import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockStored = new Map<string, { showReadReceipts?: boolean }>();
const mockLoad = jest.fn(async (_prisma: unknown, userIds: string[]) =>
  new Map(userIds.map((id) => [id, mockStored.get(id) ?? {}])),
);
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: (prisma: unknown, userIds: string[]) => mockLoad(prisma, userIds),
}));

import { earlyBurnMayReachSender } from '../afterReadEarlyBurnGate';

type Row = { id: string; userId: string | null };

const prismaWith = (findMany: () => Promise<Row[]>) =>
  ({ participant: { findMany } }) as unknown as PrismaClient;

const rows: Row[] = [
  { id: 'sender', userId: 'sender-user' },
  { id: 'reader', userId: 'reader-user' },
  { id: 'guest', userId: null },
];

const gate = (prisma: PrismaClient, onError?: (error: unknown) => void) =>
  earlyBurnMayReachSender({ prisma, conversationId: 'conv', senderParticipantId: 'sender', onError });

describe('earlyBurnMayReachSender (#18556)', () => {
  it('laisse brûler quand aucun destinataire n’a coupé ses accusés', async () => {
    mockStored.clear();
    await expect(gate(prismaWith(async () => rows))).resolves.toBe(true);
  });

  it('retient le feu dès qu’un destinataire a coupé ses accusés', async () => {
    mockStored.clear();
    mockStored.set('reader-user', { showReadReceipts: false });
    await expect(gate(prismaWith(async () => rows))).resolves.toBe(false);
  });

  it('ignore la préférence de l’expéditeur lui-même', async () => {
    mockStored.clear();
    mockStored.set('sender-user', { showReadReceipts: false });
    await expect(gate(prismaWith(async () => rows))).resolves.toBe(true);
  });

  it('retient le feu quand la lecture lève, et le signale', async () => {
    const onError = jest.fn();
    const failing = prismaWith(async () => {
      throw new Error('mongo down');
    });
    await expect(gate(failing, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('retient le feu quand les préférences ne se lisent pas', async () => {
    mockLoad.mockRejectedValueOnce(new Error('redis down'));
    await expect(gate(prismaWith(async () => rows))).resolves.toBe(false);
  });
});
