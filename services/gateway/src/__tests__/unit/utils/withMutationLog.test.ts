import { withMutationLog } from '../../../utils/withMutationLog';
import { MutationLogDuplicate } from '../../../services/MutationLogService';

function makeRequest(cmid?: string): any {
  return { clientMutationId: cmid };
}

function makeItem(id = 'item-001') {
  return { id, name: 'test-resource' };
}

function makeMocks() {
  const recordOrReturn = jest.fn();
  return {
    svc: { recordOrReturn },
    fastify: { mutationLogService: { recordOrReturn } },
  };
}

const userId = 'user-aaa';
const kind = 'sendFriendRequest';

describe('withMutationLog', () => {
  describe('no clientMutationId', () => {
    it('runs op() directly and returns its result', async () => {
      const item = makeItem();
      const op = jest.fn().mockResolvedValue(item);
      const onDuplicate = jest.fn();
      const { fastify } = makeMocks();

      const result = await withMutationLog({
        request: makeRequest(undefined),
        fastify,
        userId,
        kind,
        op,
        onDuplicate,
      });

      expect(result).toBe(item);
      expect(op).toHaveBeenCalledTimes(1);
      expect(fastify.mutationLogService.recordOrReturn).not.toHaveBeenCalled();
      expect(onDuplicate).not.toHaveBeenCalled();
    });
  });

  describe('with clientMutationId — fresh mutation', () => {
    it('delegates to recordOrReturn and returns the new result', async () => {
      const item = makeItem();
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440000';
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockResolvedValue(item as any);

      const result = await withMutationLog({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        op: jest.fn(),
        onDuplicate: jest.fn(),
      });

      expect(result).toBe(item);
      expect(svc.recordOrReturn).toHaveBeenCalledWith({
        userId,
        clientMutationId: cmid,
        kind,
        op: expect.any(Function),
      });
    });
  });

  describe('with clientMutationId — duplicate detected', () => {
    it('calls onDuplicate with resultId and returns the replayed item', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440001';
      const replayed = makeItem('item-replayed');
      const dup = new MutationLogDuplicate('item-replayed', kind);
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(dup);
      const onDuplicate = jest.fn().mockResolvedValue(replayed);

      const result = await withMutationLog({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        op: jest.fn(),
        onDuplicate,
      });

      expect(result).toBe(replayed);
      expect(onDuplicate).toHaveBeenCalledWith('item-replayed');
    });

    it('re-runs op() when onDuplicate returns null (original record gone)', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440002';
      const fallback = makeItem('item-fallback');
      const dup = new MutationLogDuplicate('old-id', kind);
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(dup);
      const onDuplicate = jest.fn().mockResolvedValue(null);
      const op = jest.fn().mockResolvedValue(fallback);

      const result = await withMutationLog({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        op,
        onDuplicate,
      });

      expect(result).toBe(fallback);
      expect(onDuplicate).toHaveBeenCalledWith('old-id');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('re-runs op() when onDuplicate returns undefined', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440003';
      const fallback = makeItem('item-undef');
      const dup = new MutationLogDuplicate('old-id', kind);
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(dup);
      const onDuplicate = jest.fn().mockResolvedValue(undefined);
      const op = jest.fn().mockResolvedValue(fallback);

      const result = await withMutationLog({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        op,
        onDuplicate,
      });

      expect(result).toBe(fallback);
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('re-runs op() when resultId is null (no id on prior log row)', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440004';
      const fallback = makeItem('item-no-id');
      const dup = new MutationLogDuplicate(null, kind);
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(dup);
      const onDuplicate = jest.fn();
      const op = jest.fn().mockResolvedValue(fallback);

      const result = await withMutationLog({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        op,
        onDuplicate,
      });

      expect(result).toBe(fallback);
      expect(onDuplicate).not.toHaveBeenCalled();
      expect(op).toHaveBeenCalledTimes(1);
    });
  });

  describe('with clientMutationId — non-duplicate error', () => {
    it('re-throws errors that are not MutationLogDuplicate', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440005';
      const err = new Error('Database connection lost');
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(err);

      await expect(
        withMutationLog({
          request: makeRequest(cmid),
          fastify,
          userId,
          kind,
          op: jest.fn(),
          onDuplicate: jest.fn(),
        })
      ).rejects.toThrow('Database connection lost');
    });
  });
});
