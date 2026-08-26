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
import { MutationLogService, MutationLogDuplicate, MutationInFlight } from '../../../services/MutationLogService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Factories ───────────────────────────────────────────────────────────────

function makePrisma(logEntry: { resultId: string | null; kind: string } | null = null) {
  return {
    mutationLog: {
      findUnique: jest.fn<any>().mockResolvedValue(logEntry),
      // La ligne est RÉSERVÉE avant l'op (`create`), CONCLUE après (`update`),
      // LIBÉRÉE si l'op rejette (`delete`) — cf. le doc-comment du service.
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
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

    it('réserve la clé AVANT op(), puis y inscrit le resultId', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const op = jest.fn<any>().mockResolvedValue({ id: 'res-42' });

      await sut.recordOrReturn({ ...BASE_ARGS, op });

      expect(prisma.mutationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: BASE_ARGS.userId,
            clientMutationId: BASE_ARGS.clientMutationId,
            kind: BASE_ARGS.kind,
          }),
        })
      );
      // La réservation ne porte AUCUN resultId : il n'existe pas encore.
      expect((prisma.mutationLog.create as any).mock.calls[0][0].data.resultId).toBeUndefined();
      expect(prisma.mutationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clientMutationId: {
              userId: BASE_ARGS.userId,
              clientMutationId: BASE_ARGS.clientMutationId,
            },
          },
          data: expect.objectContaining({ resultId: 'res-42' }),
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

      expect(prisma.mutationLog.create).not.toHaveBeenCalled();
      expect(prisma.mutationLog.update).not.toHaveBeenCalled();
    });
  });

  // ── recordOrReturn — op failure ──────────────────────────────────────────

  describe('op failure', () => {
    it('propagates the op error and LIBÈRE la réservation — le cmid reste rejouable', async () => {
      const prisma = makePrisma(null);
      const sut = makeSut(prisma);
      const opError = new Error('network timeout');
      const op = jest.fn<any>().mockRejectedValue(opError);

      await expect(sut.recordOrReturn({ ...BASE_ARGS, op })).rejects.toThrow('network timeout');
      // La ligne n'est jamais CONCLUE...
      expect(prisma.mutationLog.update).not.toHaveBeenCalled();
      // ...et la réservation est retirée : le contrat « un op qui échoue ne
      // consomme pas le cmid » survit au passage en réservation-d'abord.
      expect(prisma.mutationLog.delete).toHaveBeenCalledWith({
        where: {
          userId_clientMutationId: {
            userId: BASE_ARGS.userId,
            clientMutationId: BASE_ARGS.clientMutationId,
          },
        },
      });
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

  // ── La COURSE : deux requêtes concurrentes portant le même cmid ──────────
  //
  // `recordOrReturn` était un LIRE-PUIS-ÉCRIRE non atomique : `findUnique`,
  // puis `op()`, puis l'écriture. Deux requêtes concurrentes passaient TOUTES
  // DEUX le `findUnique` et exécutaient TOUTES DEUX `op()`. L'`upsert` final
  // faisait converger la LIGNE DE JOURNAL, jamais l'effet de bord : pour un
  // `create`, la course produisait un doublon durable.
  //
  // Ce n'est pas théorique : `OutboxFlusher.staleInflightReclaimSeconds`
  // (iOS) justifie son reclaim à 30 min par « un double-dispatch résiduel est
  // neutralisé par l'idempotence cmid côté gateway ». C'est cette phrase-là
  // que la course démentait — et la fenêtre est la plus large du dépôt sur le
  // repost d'une source éphémère, dont `op()` duplique les fichiers média
  // AVANT le `create`.

  describe('concurrent requests carrying the same cmid', () => {
    /** Faux prisma qui MODÉLISE l'index unique `(userId, clientMutationId)`. */
    function makeRacingPrisma() {
      const rows = new Map<string, { userId: string; clientMutationId: string; kind: string; resultId: string | null; createdAt: Date }>();
      const key = (w: any) => `${w.userId_clientMutationId.userId}|${w.userId_clientMutationId.clientMutationId}`;
      return {
        rows,
        prisma: {
          mutationLog: {
            findUnique: jest.fn<any>(async ({ where }: any) => rows.get(key(where)) ?? null),
            create: jest.fn<any>(async ({ data }: any) => {
              const k = `${data.userId}|${data.clientMutationId}`;
              if (rows.has(k)) {
                const err: any = new Error('Unique constraint failed');
                err.code = 'P2002';
                throw err;
              }
              rows.set(k, { ...data, resultId: data.resultId ?? null, createdAt: new Date() });
              return rows.get(k);
            }),
            update: jest.fn<any>(async ({ where, data }: any) => {
              const row = rows.get(key(where));
              if (!row) throw new Error('not found');
              Object.assign(row, data);
              return row;
            }),
            delete: jest.fn<any>(async ({ where }: any) => {
              rows.delete(key(where));
              return {};
            }),
            upsert: jest.fn<any>(async () => ({})),
          },
        } as unknown as PrismaClient,
      };
    }

    it('exécute op() UNE seule fois — le perdant ne crée pas un second résultat', async () => {
      const { prisma } = makeRacingPrisma();
      const sut = new MutationLogService(prisma);
      let created = 0;
      // `op()` lent : c'est PENDANT lui que la seconde requête arrive.
      const op = async () => {
        await new Promise((r) => setTimeout(r, 10));
        created += 1;
        return { id: `res-${created}` };
      };

      const results = await Promise.allSettled([
        sut.recordOrReturn({ ...BASE_ARGS, op }),
        sut.recordOrReturn({ ...BASE_ARGS, op }),
      ]);

      expect(created).toBe(1);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);
    });

    it('le perdant apprend que la mutation est EN VOL — il ne reçoit pas un faux succès', async () => {
      const { prisma } = makeRacingPrisma();
      const sut = new MutationLogService(prisma);
      const op = async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { id: 'res-1' };
      };

      const results = await Promise.allSettled([
        sut.recordOrReturn({ ...BASE_ARGS, op }),
        sut.recordOrReturn({ ...BASE_ARGS, op }),
      ]);

      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected).toBeDefined();
      expect((rejected.reason as Error).name).toBe('MutationInFlight');
      expect((rejected.reason as { statusCode?: number }).statusCode).toBe(409);
    });

    it('un op() qui ÉCHOUE libère le cmid — la réservation ne le poisonne pas', async () => {
      const { prisma, rows } = makeRacingPrisma();
      const sut = new MutationLogService(prisma);

      await expect(
        sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>().mockRejectedValue(new Error('boom')) })
      ).rejects.toThrow('boom');

      expect(rows.size).toBe(0);

      // Et le même cmid repasse ensuite, comme le promet le contrat.
      const again = await sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>().mockResolvedValue({ id: 'res-retry' }) });
      expect(again).toEqual({ id: 'res-retry' });
    });

    it('une réservation ABANDONNÉE (crash post-réservation) est reprise après son TTL', async () => {
      const { prisma, rows } = makeRacingPrisma();
      const sut = new MutationLogService(prisma);

      // Ligne réservée puis jamais conclue — l'écrivain a disparu.
      rows.set(`${BASE_ARGS.userId}|${BASE_ARGS.clientMutationId}`, {
        userId: BASE_ARGS.userId,
        clientMutationId: BASE_ARGS.clientMutationId,
        kind: BASE_ARGS.kind,
        resultId: null,
        createdAt: new Date(Date.now() - MutationLogService.reservationTtlMs - 1000),
      });

      const result = await sut.recordOrReturn({ ...BASE_ARGS, op: jest.fn<any>().mockResolvedValue({ id: 'res-reclaimed' }) });

      expect(result).toEqual({ id: 'res-reclaimed' });
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
