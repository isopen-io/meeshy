/**
 * Unit tests for purgeDeletedAccountMedia (#5690).
 *
 * Covers the two media families a deleted-account purge must not leave
 * behind: `MessageAttachment` (via `AttachmentService.deleteAttachment`,
 * never a raw `deleteMany`) and `PostMedia` (via `reclaimMediaRowBytes`, whose
 * `Sound` guard must be respected — a file still referenced by another
 * user's live Sound must survive).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  purgeMessageAttachmentsOfDeletedAccount,
  purgePostMediaOfDeletedAccount,
  purgeMediaOfDeletedAccount,
} from '../purgeDeletedAccountMedia';

const USER_ID = '507f1f77bcf86cd799439011';

describe('purgeMessageAttachmentsOfDeletedAccount', () => {
  it('deletes every MessageAttachment of the account through the physical-deletion service, not a raw deleteMany', async () => {
    const findMany = jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
      .mockResolvedValueOnce([]);
    const prisma = { messageAttachment: { findMany } } as any;
    const deleteAttachment = jest.fn<any>().mockResolvedValue(undefined);

    const { purged } = await purgeMessageAttachmentsOfDeletedAccount(
      prisma,
      USER_ID,
      { deleteAttachment },
      { batchSize: 2 },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uploadedBy: USER_ID, isAnonymous: false } }),
    );
    expect(deleteAttachment).toHaveBeenCalledWith('a1');
    expect(deleteAttachment).toHaveBeenCalledWith('a2');
    expect(purged).toBe(2);
  });

  it('pages through the account attachments batch by batch (never an unbounded query)', async () => {
    const findMany = jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
      .mockResolvedValueOnce([{ id: 'a3' }])
      .mockResolvedValueOnce([]);
    const prisma = { messageAttachment: { findMany } } as any;
    const deleteAttachment = jest.fn<any>().mockResolvedValue(undefined);

    const { purged } = await purgeMessageAttachmentsOfDeletedAccount(
      prisma,
      USER_ID,
      { deleteAttachment },
      { batchSize: 2 },
    );

    expect(findMany.mock.calls.every(([args]: any[]) => args.take === 2)).toBe(true);
    expect(purged).toBe(3);
  });

  it('never lets one failing attachment block the batch or loop forever on it', async () => {
    const findMany = jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'ok' }, { id: 'bad' }])
      .mockResolvedValueOnce([]);
    const prisma = { messageAttachment: { findMany } } as any;
    const deleteAttachment = jest.fn<any>((id: string) =>
      id === 'bad' ? Promise.reject(new Error('locked')) : Promise.resolve(undefined),
    );

    const { purged } = await purgeMessageAttachmentsOfDeletedAccount(
      prisma,
      USER_ID,
      { deleteAttachment },
      { batchSize: 2 },
    );

    expect(purged).toBe(1);
    // The second call must exclude the failed id — otherwise the same
    // failing row would come back forever and the loop would never end.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1][0].where.id).toEqual({ notIn: ['bad'] });
  });

  it('does nothing when the account has no remaining attachment (already purged by message anonymization)', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const prisma = { messageAttachment: { findMany } } as any;
    const deleteAttachment = jest.fn<any>();

    const { purged } = await purgeMessageAttachmentsOfDeletedAccount(prisma, USER_ID, { deleteAttachment });

    expect(purged).toBe(0);
    expect(deleteAttachment).not.toHaveBeenCalled();
  });
});

describe('purgePostMediaOfDeletedAccount', () => {
  function fakePrisma(rows: Array<{ id: string; fileUrl: string | null; thumbnailUrl?: string | null }>) {
    const findMany = jest.fn<any>()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);
    const deleteMany = jest.fn<any>().mockImplementation(async ({ where }: any) => ({
      count: where.id.in.length,
    }));
    const soundFindMany = jest.fn<any>().mockResolvedValue([]);
    return {
      prisma: { postMedia: { findMany, deleteMany }, sound: { findMany: soundFindMany } } as any,
      findMany,
      deleteMany,
      soundFindMany,
    };
  }

  it('deletes the account PostMedia rows scoped by uploaderId, through reclaimMediaRowBytes — never a raw deleteMany of the whole table', async () => {
    const { prisma, findMany, deleteMany } = fakePrisma([
      { id: 'm1', fileUrl: '/f1.jpg', thumbnailUrl: null },
    ]);
    const storage = { delete: jest.fn<any>().mockResolvedValue(undefined) };

    const { purged, reclaimed } = await purgePostMediaOfDeletedAccount(prisma, storage, USER_ID);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { uploaderId: USER_ID } }));
    expect(storage.delete).toHaveBeenCalledWith('/f1.jpg');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['m1'] } } });
    expect(purged).toBe(1);
    expect(reclaimed).toBe(1);
  });

  it("respects the Sound guard: a file still referenced by another user's live Sound survives the purge", async () => {
    const { prisma, deleteMany, soundFindMany } = fakePrisma([
      { id: 'm1', fileUrl: '/shared-cover.jpg', thumbnailUrl: null },
    ]);
    soundFindMany.mockResolvedValue([{ fileUrl: null, coverUrl: '/shared-cover.jpg' }]);
    const storage = { delete: jest.fn<any>().mockResolvedValue(undefined) };

    const { purged, reclaimed } = await purgePostMediaOfDeletedAccount(prisma, storage, USER_ID);

    // The row still gets removed (it belongs to the deleted account and has
    // no other purpose), but the byte it shares with a live Sound is spared.
    expect(storage.delete).not.toHaveBeenCalled();
    expect(reclaimed).toBe(0);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['m1'] } } });
    expect(purged).toBe(1);
  });

  it('does nothing when the account has no PostMedia', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const deleteMany = jest.fn<any>();
    const prisma = { postMedia: { findMany, deleteMany }, sound: { findMany: jest.fn<any>() } } as any;
    const storage = { delete: jest.fn<any>() };

    const { purged, reclaimed } = await purgePostMediaOfDeletedAccount(prisma, storage, USER_ID);

    expect(purged).toBe(0);
    expect(reclaimed).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('purgeMediaOfDeletedAccount', () => {
  it('orchestrates both families and reports a combined summary', async () => {
    const attachmentFindMany = jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'a1' }])
      .mockResolvedValueOnce([]);
    const postMediaFindMany = jest.fn<any>()
      .mockResolvedValueOnce([{ id: 'm1', fileUrl: '/f1.jpg', thumbnailUrl: null }])
      .mockResolvedValueOnce([]);
    const postMediaDeleteMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const prisma = {
      messageAttachment: { findMany: attachmentFindMany },
      postMedia: { findMany: postMediaFindMany, deleteMany: postMediaDeleteMany },
      sound: { findMany: jest.fn<any>().mockResolvedValue([]) },
    } as any;
    const attachmentRemover = { deleteAttachment: jest.fn<any>().mockResolvedValue(undefined) };
    const storage = { delete: jest.fn<any>().mockResolvedValue(undefined) };

    const summary = await purgeMediaOfDeletedAccount(prisma, attachmentRemover, storage, USER_ID);

    expect(summary).toEqual({ attachmentsPurged: 1, postMediaPurged: 1, postMediaBytesReclaimed: 1 });
  });
});
