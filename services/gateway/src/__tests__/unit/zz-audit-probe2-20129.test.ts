/** @jest-environment node */
import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import { purgeMediaOfDeletedAccount } from '../../services/purgeDeletedAccountMedia';

const UID = '507f1f77bcf86cd799439011';
const P = (n: number) => `507f1f77bcf86cd7994${String(390 + n).padStart(5, '0')}`;

const att = (id: string, uploadedBy: string): MongoDocument => ({ id, uploadedBy, isAnonymous: false });

const harness = (rows: MongoDocument[], participantIds: readonly string[]) => {
  const attachments = [...rows];
  return {
    prisma: {
      participant: {
        findMany: jest.fn<any>(async ({ skip = 0, take }: any) =>
          participantIds.slice(skip, take === undefined ? undefined : skip + take).map((id) => ({ id }))),
      },
      messageAttachment: {
        findMany: async ({ where, take }: any) => attachments.filter((r) => matchesMongoWhere(r, where)).slice(0, take),
      },
      postMedia: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
      sound: { findMany: async () => [] },
    } as never,
    remove: (id: string) => {
      const i = attachments.findIndex((r) => r.id === id);
      if (i >= 0) attachments.splice(i, 1);
    },
    remaining: () => attachments.map((r) => r.id),
  };
};

describe('probe — purge multi-fournées de participations', () => {
  it('ne compte PAS deux fois une pièce du compte, et purge une pièce de la 2e fournée', async () => {
    // 250 participations => 2 fournées (200 + 50) avec le défaut interne
    const pids = Array.from({ length: 250 }, (_, i) => P(i));
    const h = harness([att('a-nominal', UID), att('a-fournee2', pids[240])], pids);
    const remover = { deleteAttachment: jest.fn<any>(async (id: string) => h.remove(id)) };

    const r = await purgeMediaOfDeletedAccount(h.prisma, remover, { deleteFile: async () => undefined } as never, UID, { batchSize: 200 });

    expect(r.attachmentsDeleted).toBe(2);
    expect(h.remaining()).toEqual([]);
  });

  it('une pièce qui RÉSISTE est retentée une fois PAR fournée de participations', async () => {
    const pids = Array.from({ length: 250 }, (_, i) => P(i));
    const h = harness([att('a-resiste', UID)], pids);
    const remover = { deleteAttachment: jest.fn<any>(async () => { throw new Error('nope'); }) };

    const r = await purgeMediaOfDeletedAccount(h.prisma, remover, { deleteFile: async () => undefined } as never, UID, { batchSize: 200 });

    expect(r.attachmentsDeleted).toBe(0);
    expect(remover.deleteAttachment).toHaveBeenCalledTimes(2);
  });
});
