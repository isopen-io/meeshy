import { withMutationLog, withMutationOutcome, MutationResultGone } from '../../../utils/withMutationLog';
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
        replayCost: 'converges',
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
        replayCost: 'converges',
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
        replayCost: 'converges',
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
        replayCost: 'converges',
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
        replayCost: 'converges',
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
        replayCost: 'converges',
        op,
        onDuplicate,
      });

      expect(result).toBe(fallback);
      expect(onDuplicate).not.toHaveBeenCalled();
      expect(op).toHaveBeenCalledTimes(1);
    });
  });

  // ── replayCost: 'diverges' — le filet « rejoue op() » est REFUSÉ ─────────
  //
  // Le filet du helper suppose une op « naturellement idempotente au niveau du
  // stockage ». Sur un `prisma.post.create`, le rejouer FABRIQUE un doublon :
  // un repost (ou un post, ou un commentaire) supprimé par son auteur
  // ressuscitait sous un id neuf dès qu'une ligne d'outbox périmée le rejouait.
  describe("with clientMutationId — replayCost 'diverges'", () => {
    it('does NOT re-run op() when onDuplicate returns null — it reports `gone`', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440010';
      const dup = new MutationLogDuplicate('old-id', kind);
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(dup);
      const onDuplicate = jest.fn().mockResolvedValue(null);
      const op = jest.fn().mockResolvedValue(makeItem('should-never-be-created'));

      const outcome = await withMutationOutcome({
        request: makeRequest(cmid),
        fastify,
        userId,
        kind,
        replayCost: 'diverges',
        op,
        onDuplicate,
      });

      expect(outcome).toEqual({ status: 'gone', resultId: 'old-id' });
      expect(op).not.toHaveBeenCalled();
    });

    it('does NOT re-run op() when the prior log row carries no resultId', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440011';
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(new MutationLogDuplicate(null, kind));
      const op = jest.fn();
      const onDuplicate = jest.fn();

      const outcome = await withMutationOutcome({
        request: makeRequest(cmid), fastify, userId, kind,
        replayCost: 'diverges', op, onDuplicate,
      });

      expect(outcome).toEqual({ status: 'gone', resultId: null });
      expect(op).not.toHaveBeenCalled();
      expect(onDuplicate).not.toHaveBeenCalled();
    });

    it('withMutationLog (la projection) lève MutationResultGone, porteuse d\'un 410', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440012';
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(new MutationLogDuplicate('old-id', kind));

      await expect(
        withMutationLog({
          request: makeRequest(cmid), fastify, userId, kind,
          replayCost: 'diverges',
          op: jest.fn(),
          onDuplicate: jest.fn().mockResolvedValue(null) as any,
        })
      ).rejects.toMatchObject({ name: 'MutationResultGone', resultId: 'old-id', statusCode: 410 });
    });

    it('un rejeu LISIBLE reste servi normalement — `diverges` ne bloque que la disparition', async () => {
      const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440013';
      const replayed = makeItem('item-replayed');
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(new MutationLogDuplicate('item-replayed', kind));
      const op = jest.fn();

      const outcome = await withMutationOutcome({
        request: makeRequest(cmid), fastify, userId, kind,
        replayCost: 'diverges',
        op,
        onDuplicate: jest.fn().mockResolvedValue(replayed) as any,
      });

      expect(outcome).toEqual({ status: 'replayed', result: replayed });
      expect(op).not.toHaveBeenCalled();
    });
  });

  // ── Le VERDICT — « produit » vs « rejoué » ───────────────────────────────
  //
  // C'est la question que le helper ne rendait pas, et faute de la rendre,
  // toute route portant un effet de bord APRÈS le journal le refaisait à
  // chaque rejeu : diffusion refanée, seconde ligne `Notification`, second
  // push. Le contenu cessait d'être dupliqué, l'ANNONCE non.
  describe('withMutationOutcome — le verdict', () => {
    it('rend `applied` quand op() vient de s\'exécuter (sans cmid)', async () => {
      const item = makeItem();
      const { fastify } = makeMocks();

      const outcome = await withMutationOutcome({
        request: makeRequest(undefined), fastify, userId, kind,
        replayCost: 'converges',
        op: jest.fn().mockResolvedValue(item) as any,
        onDuplicate: jest.fn(),
      });

      expect(outcome).toEqual({ status: 'applied', result: item });
    });

    it('rend `applied` sur une mutation FRAÎCHE avec cmid', async () => {
      const item = makeItem();
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockResolvedValue(item as any);

      const outcome = await withMutationOutcome({
        request: makeRequest('cmid_550e8400-e29b-41d4-a716-446655440014'),
        fastify, userId, kind, replayCost: 'converges',
        op: jest.fn(), onDuplicate: jest.fn(),
      });

      expect(outcome).toEqual({ status: 'applied', result: item });
    });

    it('rend `replayed` — et c\'est CE verdict qui retient les effets de bord', async () => {
      const replayed = makeItem('item-replayed');
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(new MutationLogDuplicate('item-replayed', kind));

      const outcome = await withMutationOutcome({
        request: makeRequest('cmid_550e8400-e29b-41d4-a716-446655440015'),
        fastify, userId, kind, replayCost: 'converges',
        op: jest.fn(),
        onDuplicate: jest.fn().mockResolvedValue(replayed) as any,
      });

      expect(outcome.status).toBe('replayed');
    });

    it("rend `applied` quand `converges` rejoue op() — l'op s'est bien exécutée", async () => {
      const fallback = makeItem('item-fallback');
      const { svc, fastify } = makeMocks();
      svc.recordOrReturn.mockRejectedValue(new MutationLogDuplicate('old-id', kind));
      const op = jest.fn().mockResolvedValue(fallback);

      const outcome = await withMutationOutcome({
        request: makeRequest('cmid_550e8400-e29b-41d4-a716-446655440016'),
        fastify, userId, kind, replayCost: 'converges',
        op: op as any,
        onDuplicate: jest.fn().mockResolvedValue(null) as any,
      });

      expect(outcome).toEqual({ status: 'applied', result: fallback });
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
          replayCost: 'converges',
          op: jest.fn(),
          onDuplicate: jest.fn(),
        })
      ).rejects.toThrow('Database connection lost');
    });
  });
});
