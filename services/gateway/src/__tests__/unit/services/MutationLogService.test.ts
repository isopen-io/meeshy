/**
 * MutationLogService Unit Tests
 *
 * Covers:
 * - MutationLogDuplicate: error name, resultId, kind, message
 * - recordOrReturn(): duplicate → throws MutationLogDuplicate with prior resultId
 * - recordOrReturn(): fresh → executes op, upserts log, returns result
 * - recordOrReturn(): op failure → log NOT persisted (retry semantics)
 * - recordOrReturn(): passes correct upsert payload (concurrent race convergence)
 *
 * @jest-environment node
 */

import { MutationLogService, MutationLogDuplicate } from '../../../services/MutationLogService';

type MutationLogRow = { resultId: string | null; kind: string };

function makePrisma(existingRow: MutationLogRow | null = null) {
  return {
    mutationLog: {
      findUnique: jest.fn().mockResolvedValue(existingRow),
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

const BASE_ARGS = {
  userId: 'user_001',
  clientMutationId: 'cmid_abc123',
  kind: 'friend_request',
};

describe('MutationLogDuplicate', () => {
  it('is an Error subclass with name MutationLogDuplicate', () => {
    const err = new MutationLogDuplicate('result_42', 'friend_request');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MutationLogDuplicate');
  });

  it('exposes resultId and kind properties', () => {
    const err = new MutationLogDuplicate('result_42', 'friend_request');
    expect(err.resultId).toBe('result_42');
    expect(err.kind).toBe('friend_request');
  });

  it('accepts null resultId', () => {
    const err = new MutationLogDuplicate(null, 'profile_update');
    expect(err.resultId).toBeNull();
  });

  it('includes resultId and kind in message', () => {
    const err = new MutationLogDuplicate('result_42', 'friend_request');
    expect(err.message).toMatch('friend_request');
    expect(err.message).toMatch('result_42');
  });
});

describe('MutationLogService', () => {
  describe('recordOrReturn — duplicate path', () => {
    it('throws MutationLogDuplicate when cmid already exists', async () => {
      const prisma = makePrisma({ resultId: 'existing_id', kind: 'friend_request' });
      const svc = new MutationLogService(prisma);

      await expect(
        svc.recordOrReturn({ ...BASE_ARGS, op: jest.fn() })
      ).rejects.toThrow(MutationLogDuplicate);
    });

    it('throws with the prior resultId from the log', async () => {
      const prisma = makePrisma({ resultId: 'prior_result_999', kind: 'friend_request' });
      const svc = new MutationLogService(prisma);

      try {
        await svc.recordOrReturn({ ...BASE_ARGS, op: jest.fn() });
        fail('Expected MutationLogDuplicate to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MutationLogDuplicate);
        expect((err as MutationLogDuplicate).resultId).toBe('prior_result_999');
      }
    });

    it('throws with null resultId when log has null resultId', async () => {
      const prisma = makePrisma({ resultId: null, kind: 'profile_update' });
      const svc = new MutationLogService(prisma);

      try {
        await svc.recordOrReturn({ ...BASE_ARGS, kind: 'profile_update', op: jest.fn() });
        fail('Expected MutationLogDuplicate');
      } catch (err) {
        expect((err as MutationLogDuplicate).resultId).toBeNull();
      }
    });

    it('does not call op when duplicate is detected', async () => {
      const prisma = makePrisma({ resultId: 'prior', kind: 'friend_request' });
      const svc = new MutationLogService(prisma);
      const op = jest.fn();

      await expect(svc.recordOrReturn({ ...BASE_ARGS, op })).rejects.toThrow(MutationLogDuplicate);

      expect(op).not.toHaveBeenCalled();
    });

    it('does not upsert when duplicate is detected', async () => {
      const prisma = makePrisma({ resultId: 'prior', kind: 'friend_request' });
      const svc = new MutationLogService(prisma);

      await expect(svc.recordOrReturn({ ...BASE_ARGS, op: jest.fn() })).rejects.toThrow();

      expect(prisma.mutationLog.upsert).not.toHaveBeenCalled();
    });

    it('queries by correct compound key', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockResolvedValue({ id: 'r1' });

      await svc.recordOrReturn({ ...BASE_ARGS, op });

      expect(prisma.mutationLog.findUnique).toHaveBeenCalledWith({
        where: {
          userId_clientMutationId: {
            userId: BASE_ARGS.userId,
            clientMutationId: BASE_ARGS.clientMutationId,
          },
        },
        select: { resultId: true, kind: true },
      });
    });
  });

  describe('recordOrReturn — fresh path', () => {
    it('calls op when no existing log entry', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockResolvedValue({ id: 'new_result' });

      await svc.recordOrReturn({ ...BASE_ARGS, op });

      expect(op).toHaveBeenCalledTimes(1);
    });

    it('returns the op result', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const payload = { id: 'new_result', extra: 'data' };
      const op = jest.fn().mockResolvedValue(payload);

      const result = await svc.recordOrReturn({ ...BASE_ARGS, op });

      expect(result).toEqual(payload);
    });

    it('upserts the mutation log after a successful op', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockResolvedValue({ id: 'new_result' });

      await svc.recordOrReturn({ ...BASE_ARGS, op });

      expect(prisma.mutationLog.upsert).toHaveBeenCalledTimes(1);
    });

    it('upsert create payload includes userId, clientMutationId, kind, resultId', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockResolvedValue({ id: 'result_xyz' });

      await svc.recordOrReturn({ ...BASE_ARGS, op });

      expect(prisma.mutationLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: BASE_ARGS.userId,
            clientMutationId: BASE_ARGS.clientMutationId,
            kind: BASE_ARGS.kind,
            resultId: 'result_xyz',
          }),
        })
      );
    });

    it('upsert update payload sets kind without clobbering resultId', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockResolvedValue({ id: 'result_xyz' });

      await svc.recordOrReturn({ ...BASE_ARGS, op });

      const call = (prisma.mutationLog.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update).toEqual({ kind: BASE_ARGS.kind });
      expect(call.update).not.toHaveProperty('resultId');
    });
  });

  describe('recordOrReturn — op failure (retry semantics)', () => {
    it('propagates op error without persisting log entry', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const op = jest.fn().mockRejectedValue(new Error('DB write failed'));

      await expect(svc.recordOrReturn({ ...BASE_ARGS, op })).rejects.toThrow('DB write failed');

      expect(prisma.mutationLog.upsert).not.toHaveBeenCalled();
    });

    it('does not swallow op error', async () => {
      const prisma = makePrisma(null);
      const svc = new MutationLogService(prisma);
      const specificError = new Error('constraint violation');
      const op = jest.fn().mockRejectedValue(specificError);

      await expect(svc.recordOrReturn({ ...BASE_ARGS, op })).rejects.toBe(specificError);
    });
  });
});
