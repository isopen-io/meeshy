/**
 * Unit tests for MutationLogService — Wave 1 Task 3.4 (B2).
 *
 * Drives the service against a fake prisma layer so the test runs in
 * a few ms without touching MongoDB. Verifies the three branches that
 * matter for correctness :
 *   1. Fresh mutation → op runs once, MutationLog row is persisted.
 *   2. Replay of same cmid → MutationLogDuplicate carries the prior
 *      resultId, op does NOT run a second time.
 *   3. op rejection → MutationLog row is NOT persisted, so a retry
 *      with the same cmid will retry the op.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  MutationLogService,
  MutationLogDuplicate,
} from '../../services/MutationLogService';

type LogRow = {
  userId: string;
  clientMutationId: string;
  kind: string;
  resultId: string | null;
};

function makeFakePrisma() {
  const rows: LogRow[] = [];
  const findUnique = jest.fn(async (args: any) => {
    const { userId, clientMutationId } = args.where.userId_clientMutationId;
    const found = rows.find(
      r => r.userId === userId && r.clientMutationId === clientMutationId
    );
    if (!found) return null;
    return { resultId: found.resultId, kind: found.kind };
  });
  const upsert = jest.fn(async (args: any) => {
    const { userId, clientMutationId } = args.where.userId_clientMutationId;
    const existing = rows.find(
      r => r.userId === userId && r.clientMutationId === clientMutationId
    );
    if (existing) {
      existing.kind = args.update.kind ?? existing.kind;
      return existing;
    }
    const row: LogRow = {
      userId,
      clientMutationId,
      kind: args.create.kind,
      resultId: args.create.resultId,
    };
    rows.push(row);
    return row;
  });
  return {
    prisma: {
      mutationLog: { findUnique, upsert },
    },
    rows,
    spies: { findUnique, upsert },
  };
}

describe('MutationLogService', () => {
  const userId = '64a1b2c3d4e5f6a7b8c9d0e1';
  const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440000';

  let fake: ReturnType<typeof makeFakePrisma>;
  let service: MutationLogService;

  beforeEach(() => {
    fake = makeFakePrisma();
    service = new MutationLogService(fake.prisma as any);
  });

  it('runs op once and persists the MutationLog row on fresh cmid', async () => {
    const op = jest.fn<() => Promise<{ id: string; value: number }>>().mockResolvedValue({
      id: 'result_001',
      value: 42,
    });

    const result = await service.recordOrReturn({
      userId,
      clientMutationId: cmid,
      kind: 'createPost',
      op,
    });

    expect(op).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'result_001', value: 42 });
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]).toMatchObject({
      userId,
      clientMutationId: cmid,
      kind: 'createPost',
      resultId: 'result_001',
    });
  });

  it('throws MutationLogDuplicate on replay and does NOT call op', async () => {
    // Pre-populate as if first call succeeded.
    fake.rows.push({
      userId,
      clientMutationId: cmid,
      kind: 'createPost',
      resultId: 'result_001',
    });

    const op = jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'should_not_run' });

    await expect(
      service.recordOrReturn({
        userId,
        clientMutationId: cmid,
        kind: 'createPost',
        op,
      })
    ).rejects.toBeInstanceOf(MutationLogDuplicate);

    expect(op).not.toHaveBeenCalled();

    try {
      await service.recordOrReturn({
        userId,
        clientMutationId: cmid,
        kind: 'createPost',
        op,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(MutationLogDuplicate);
      const dup = err as MutationLogDuplicate;
      expect(dup.resultId).toBe('result_001');
      expect(dup.kind).toBe('createPost');
    }
  });

  it('does NOT persist MutationLog when op rejects, allowing client retry', async () => {
    const op = jest.fn<() => Promise<{ id: string }>>().mockRejectedValue(
      new Error('Transient DB failure')
    );

    await expect(
      service.recordOrReturn({
        userId,
        clientMutationId: cmid,
        kind: 'createPost',
        op,
      })
    ).rejects.toThrow('Transient DB failure');

    expect(op).toHaveBeenCalledTimes(1);
    expect(fake.rows).toHaveLength(0);
    expect(fake.spies.upsert).not.toHaveBeenCalled();
  });

  it('treats different cmids as independent mutations', async () => {
    const cmidB = 'cmid_a0b1c2d3-1111-4222-9333-444455556666';
    const op = jest.fn<() => Promise<{ id: string }>>()
      .mockResolvedValueOnce({ id: 'result_a' })
      .mockResolvedValueOnce({ id: 'result_b' });

    await service.recordOrReturn({ userId, clientMutationId: cmid, kind: 'createPost', op });
    await service.recordOrReturn({ userId, clientMutationId: cmidB, kind: 'createPost', op });

    expect(op).toHaveBeenCalledTimes(2);
    expect(fake.rows).toHaveLength(2);
    expect(fake.rows.map(r => r.resultId)).toEqual(['result_a', 'result_b']);
  });

  it('keys dedup by (userId, clientMutationId) — same cmid from a different user is a fresh mutation', async () => {
    const otherUser = '64a1b2c3d4e5f6a7b8c9d0e2';
    const op = jest.fn<() => Promise<{ id: string }>>()
      .mockResolvedValueOnce({ id: 'result_user1' })
      .mockResolvedValueOnce({ id: 'result_user2' });

    await service.recordOrReturn({ userId, clientMutationId: cmid, kind: 'sendFriendRequest', op });
    await service.recordOrReturn({
      userId: otherUser,
      clientMutationId: cmid,
      kind: 'sendFriendRequest',
      op,
    });

    expect(op).toHaveBeenCalledTimes(2);
    expect(fake.rows).toHaveLength(2);
  });

  it('MutationLogDuplicate carries kind + resultId for downstream introspection', () => {
    const err = new MutationLogDuplicate('result_xyz', 'updateProfile');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MutationLogDuplicate');
    expect(err.resultId).toBe('result_xyz');
    expect(err.kind).toBe('updateProfile');
    expect(err.message).toContain('updateProfile');
    expect(err.message).toContain('result_xyz');
  });

  it('MutationLogDuplicate handles null resultId (mutations without canonical record)', () => {
    const err = new MutationLogDuplicate(null, 'unblockUser');
    expect(err.resultId).toBeNull();
    expect(err.message).toContain('null');
  });
});
