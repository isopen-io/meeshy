/**
 * Unit tests for MutationLogService
 * Covers: fresh mutation (no log entry) → op executed + log upserted + result returned,
 * duplicate mutation → MutationLogDuplicate thrown with correct resultId and kind,
 * op failure → MutationLogDuplicate NOT thrown, error propagated, log NOT written,
 * MutationLogDuplicate carries null resultId when stored resultId is null.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MutationLogService, MutationLogDuplicate } from '../../../services/MutationLogService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Factories ───────────────────────────────────────────────────────────────

function makePrisma(logEntry: { resultId: string | null; kind: string } | null = null) {
  return {
    mutationLog: {
      findUnique: jest.fn<any>().mockResolvedValue(logEntry),
      upsert: jest.fn<any>().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function makeSut(prisma?: PrismaClient) {
  return new MutationLogService(prisma ?? makePrisma());
}

const BASE_ARGS = {
  userId: 'user-1',
  clientMutationId: 'cmid_abc123',
  kind: 'friend-request',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MutationLogService', () => {
  // ── recordOrReturn — fresh mutation ─────────────────────────────────────

  describe('fresh mutation (no existing log entry)', () => {
    it('executes the op and returns its result', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const op = jest.fn<any>().mockResolvedValue({ id: 'new-resource-1', name: 'Alice' });

      const result = await sut.recordOrReturn({ ...BASE_ARGS, op });

      expect(result).toEqual({ id: 'new-resource-1', name: 'Alice' });
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('upserts the log with resultId from op result', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const op = jest.fn<any>().mockResolvedValue({ id: 'res-42' });

      await sut.recordOrReturn({ ...BASE_ARGS, op });

      expect(prisma.mutationLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clientMutationId: {
              userId: BASE_ARGS.userId,
              clientMutationId: BASE_ARGS.clientMutationId,
            },
          },
          create: expect.objectContaining({
            userId: BASE_ARGS.userId,
            clientMutationId: BASE_ARGS.clientMutationId,
            kind: BASE_ARGS.kind,
            resultId: 'res-42',
          }),
        })
      );
    });

    it('queries the log with the correct composite key', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);

      await sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>().mockResolvedValue({ id: 'x' }) });

      expect(prisma.mutationLog.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clientMutationId: {
              userId: BASE_ARGS.userId,
              clientMutationId: BASE_ARGS.clientMutationId,
            },
          },
        })
      );
    });
  });

  // ── recordOrReturn — duplicate mutation ──────────────────────────────────

  describe('duplicate mutation (log entry exists)', () => {
    it('throws MutationLogDuplicate without calling op', async () => {
      const prisma = makePrisma({ resultId: 'res-42', kind: 'friend-request' });
      const sut = makeSut(prisma);
      const op = jest.fn<any>();

      await expect(
        sut.recordOrReturn({ ...BASE_ARGS, op })
      ).rejects.toThrow(MutationLogDuplicate);

      expect(op).not.toHaveBeenCalled();
    });

    it('MutationLogDuplicate carries the prior resultId', async () => {
      const prisma = makePrisma({ resultId: 'prior-result-99', kind: 'friend-request' });
      const sut = makeSut(prisma);

      try {
        await sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>() });
        throw new Error('should not reach here');
      } catch (err) {
        expect(err).toBeInstanceOf(MutationLogDuplicate);
        expect((err as MutationLogDuplicate).resultId).toBe('prior-result-99');
      }
    });

    it('MutationLogDuplicate carries the prior kind', async () => {
      const prisma = makePrisma({ resultId: 'r1', kind: 'block-user' });
      const sut = makeSut(prisma);

      try {
        await sut.recordOrReturn({ ...BASE_ARGS, kind: 'block-user', op: jest.fn<any>() });
        throw new Error('should not reach here');
      } catch (err) {
        expect((err as MutationLogDuplicate).kind).toBe('block-user');
      }
    });

    it('MutationLogDuplicate.resultId can be null', async () => {
      const prisma = makePrisma({ resultId: null, kind: 'post-like' });
      const sut = makeSut(prisma);

      await expect(
        sut.recordOrReturn({ ...BASE_ARGS, kind: 'post-like', op: jest.fn<any>() })
      ).rejects.toMatchObject({ resultId: null });
    });

    it('does NOT write a new log entry on duplicate', async () => {
      const prisma = makePrisma({ resultId: 'r', kind: 'friend-request' });
      const sut = makeSut(prisma);

      await expect(
        sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>() })
      ).rejects.toBeInstanceOf(MutationLogDuplicate);

      expect(prisma.mutationLog.upsert).not.toHaveBeenCalled();
    });
  });

  // ── recordOrReturn — op failure ──────────────────────────────────────────

  describe('op failure', () => {
    it('propagates the op error without writing a log entry', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const opError = new Error('network timeout');
      const op = jest.fn<any>().mockRejectedValue(opError);

      await expect(sut.recordOrReturn({ ...BASE_ARGS, op })).rejects.toThrow('network timeout');
      expect(prisma.mutationLog.upsert).not.toHaveBeenCalled();
    });

    it('error thrown is not a MutationLogDuplicate', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const op = jest.fn<any>().mockRejectedValue(new Error('db error'));

      await expect(
        sut.recordOrReturn({ ...BASE_ARGS, op })
      ).rejects.not.toBeInstanceOf(MutationLogDuplicate);
    });
  });

  // ── MutationLogDuplicate class ───────────────────────────────────────────

  describe('MutationLogDuplicate', () => {
    it('has name MutationLogDuplicate', () => {
      const err = new MutationLogDuplicate('id-1', 'comment');
      expect(err.name).toBe('MutationLogDuplicate');
    });

    it('is an instance of Error', () => {
      expect(new MutationLogDuplicate(null, 'post-like')).toBeInstanceOf(Error);
    });

    it('message contains kind and resultId', () => {
      const err = new MutationLogDuplicate('my-id', 'block-user');
      expect(err.message).toContain('block-user');
      expect(err.message).toContain('my-id');
    });
  });
});
