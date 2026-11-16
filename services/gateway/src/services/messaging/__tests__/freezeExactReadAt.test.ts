/**
 * #18556 — seul l'accusé EXACT (la liste des messages affichés) prouve qu'un
 * message a été VU. Il pose `exactReadAt`, write-once ; l'accusé hérité, qui
 * grave `readAt` sur toute une plage, ne le pose jamais. Le départ du lecteur
 * ne brûle une flamme-œil que sur ce champ.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { freezeMessageStatus } from '../freezeMessageStatus';

const CONV = '507f1f77bcf86cd799439011';
const READER = '507f1f77bcf86cd799439022';
const AT = new Date('2026-11-16T12:00:00.000Z');

function prismaWith(existing: Array<{ messageId: string; readAt: Date | null }>) {
  const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
  const prisma = {
    message: { findMany: jest.fn(async () => [{ id: 'm-1' }, { id: 'm-2' }]) },
    messageStatusEntry: {
      findMany: jest.fn(async () => existing.map((e) => ({ ...e, deliveredAt: null, viewedLanguages: [] }))),
      createMany: jest.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
      updateMany,
    },
    participant: { findMany: jest.fn(async () => []) },
  };
  return { prisma, updateMany };
}

const exactWrites = (updateMany: jest.Mock) =>
  updateMany.mock.calls
    .map(([args]) => args as { where: Record<string, unknown>; data: Record<string, unknown> })
    .filter((args) => 'exactReadAt' in args.data);

describe('freezeMessageStatus — exactReadAt (#18556)', () => {
  it('l’accusé EXACT pose exactReadAt sur chaque message affiché, même déjà gravé lu par l’accusé hérité', async () => {
    const { prisma, updateMany } = prismaWith([{ messageId: 'm-1', readAt: new Date('2026-11-16T11:00:00.000Z') }]);

    await freezeMessageStatus(prisma as never, {
      participantId: READER,
      conversationId: CONV,
      since: null,
      at: AT,
      field: 'readAt',
      messageIds: ['m-1', 'm-2'],
    });

    const writes = exactWrites(updateMany);
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toEqual({ exactReadAt: AT });
    expect(writes[0].where).toMatchObject({ messageId: { in: ['m-1', 'm-2'] }, participantId: READER });
  });

  it('l’accusé HÉRITÉ (une plage) ne pose jamais exactReadAt', async () => {
    const { prisma, updateMany } = prismaWith([]);

    await freezeMessageStatus(prisma as never, {
      participantId: READER,
      conversationId: CONV,
      since: null,
      at: AT,
      field: 'readAt',
    });

    expect(exactWrites(updateMany)).toHaveLength(0);
  });
});
