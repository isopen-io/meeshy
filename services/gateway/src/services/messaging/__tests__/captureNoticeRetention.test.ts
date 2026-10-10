/**
 * #9629 a — un avis de capture meurt : 24 h après ce qu'il nomme, par le
 * balayage des éphémères ; avec lui, quand le message capturé est supprimé pour
 * tous ; et un avis écrit avant ce lot reçoit son échéance au démarrage.
 *
 * Le double Prisma ÉVALUE chaque `where` avec la sémantique MongoDB
 * (`helpers/mongo-where.ts`) : une clé absente n'y est pas un `null`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';
import { applyMessageRemovalEffects } from '../messageRemovalEffects';
import { CAPTURE_NOTICE_RETENTION_MS } from '../captureNoticeVisibility';
import { CAPTURE_NOTICE_BACKFILL_BATCH, backfillCaptureNoticeDeadlines, boundCaptureNoticesNaming } from '../captureNoticeRetention';

const CONV = '507f1f77bcf86cd799439011';
const CAPTURED = '507f1f77bcf86cd799439031';
const OTHER = '507f1f77bcf86cd799439032';
const NOW = new Date('2026-10-08T12:00:00.000Z');

const notice = (id: string, capturedMessageId: string, extra: MongoDocument = {}): MongoDocument => ({
  id,
  conversationId: CONV,
  senderId: 'p-capturer',
  createdAt: new Date('2026-10-08T10:05:00.000Z'),
  deletedAt: null,
  messageSource: 'system',
  messageType: 'system',
  expiresAt: new Date('2026-10-16T10:00:00.000Z'),
  metadata: { kind: 'content-capture', capturedMessageId },
  ...extra,
});

function table(rows: MongoDocument[]) {
  const updates: Array<{ where: MongoDocument; data: MongoDocument }> = [];
  const prisma = {
    message: {
      findMany: async ({ where, take }: { where?: MongoDocument; take?: number }) =>
        rows.filter((row) => matchesMongoWhere(row, where)).slice(0, take ?? rows.length),
      findFirst: async () => null,
      updateMany: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        updates.push({ where, data });
        return { count: rows.filter((row) => matchesMongoWhere(row, where)).length };
      },
      update: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        updates.push({ where, data });
        return {};
      },
    },
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  return { prisma: prisma as unknown as PrismaClient, updates };
}

describe('boundCaptureNoticesNaming — la cascade', () => {
  it('un retrait voulu ramène à maintenant l’échéance des seuls avis qui nomment le message supprimé', async () => {
    const { prisma, updates } = table([notice('n-1', CAPTURED), notice('n-2', OTHER), notice('n-3', CAPTURED, { deletedAt: NOW })]);
    expect(await boundCaptureNoticesNaming(prisma, { conversationId: CONV, capturedMessageId: CAPTURED, now: NOW, cause: 'deleted' })).toBe(1);
    expect(updates).toEqual([{ where: { id: { in: ['n-1'] }, expiresAt: { gt: NOW } }, data: { expiresAt: NOW } }]);
  });
});

describe('applyMessageRemovalEffects — un retrait voulu emporte les avis, une échéance non', () => {
  const removed = { id: CAPTURED, conversationId: CONV, senderId: 'p-author', senderUserId: 'u-author', messageType: 'text', attachmentMimeTypes: [], content: 'x', metadata: null };

  it('supprimé pour tous (le défaut des trois transports de suppression) : l’avis meurt au passage suivant du balayage', async () => {
    const { prisma, updates } = table([notice('n-1', CAPTURED)]);
    await applyMessageRemovalEffects(prisma, removed, undefined);
    expect(updates.filter((u) => 'expiresAt' in u.data).map((u) => (u.where.id as { in: string[] }).in)).toEqual([['n-1']]);
  });

  it('échu (le balayage) : l’avis vit encore, 24 h au plus', async () => {
    const { prisma, updates } = table([notice('n-1', CAPTURED)]);
    const before = Date.now();
    await applyMessageRemovalEffects(prisma, removed, undefined, { cause: 'expired' });
    const [bound] = updates.filter((u) => 'expiresAt' in u.data);
    expect((bound.data.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(before + CAPTURE_NOTICE_RETENTION_MS);
  });
});

describe('backfillCaptureNoticeDeadlines — les avis écrits avant leur échéance', () => {
  it('pose max(échéance du capturé, date de l’avis) + 24 h, et ne touche aucun autre message système', async () => {
    const capturedExpiresAt = new Date('2026-10-09T10:00:00.000Z');
    const legacy = notice('n-old', CAPTURED);
    delete legacy.expiresAt;
    const join = { ...notice('n-join', CAPTURED), metadata: { kind: 'member-joined' } };
    delete join.expiresAt;
    const before = { ...notice('n-before', CAPTURED), createdAt: new Date('2026-10-01T00:00:00.000Z') };
    delete before.expiresAt;
    const { prisma, updates } = table([
      legacy,
      join,
      before,
      { id: CAPTURED, conversationId: CONV, messageSource: 'user', messageType: 'text', createdAt: new Date('2026-10-08T10:00:00.000Z'), deletedAt: null, expiresAt: capturedExpiresAt },
    ]);

    expect(await backfillCaptureNoticeDeadlines(prisma)).toBe(1);
    expect(updates).toEqual([
      { where: { id: 'n-old' }, data: { expiresAt: new Date(capturedExpiresAt.getTime() + CAPTURE_NOTICE_RETENTION_MS) } },
    ]);
  });

  it('avance par curseur jusqu’à épuisement — mille autres messages système ne cachent pas l’avis qui les suit (#8)', async () => {
    const joins = Array.from({ length: CAPTURE_NOTICE_BACKFILL_BATCH }, (_, i) => {
      const row: MongoDocument = { ...notice(`a-${String(i).padStart(5, '0')}`, CAPTURED), metadata: { kind: 'member-joined' } };
      delete row.expiresAt;
      return row;
    });
    const late = notice('z-late', CAPTURED);
    delete late.expiresAt;
    const rows = [...joins, late];
    const updates: MongoDocument[] = [];
    const prisma = {
      message: {
        findMany: async ({ where, take, orderBy }: { where: MongoDocument; take?: number; orderBy?: unknown }) => {
          const { id: cursor, ...rest } = where as { id?: { gt: string } };
          const hits = rows.filter((row) => matchesMongoWhere(row, rest) && (!cursor || String(row.id) > cursor.gt));
          if (orderBy) hits.sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return hits.slice(0, take ?? hits.length);
        },
        update: async ({ where }: { where: MongoDocument }) => {
          updates.push(where);
          return {};
        },
      },
    } as unknown as PrismaClient;
    expect(await backfillCaptureNoticeDeadlines(prisma)).toBe(1);
    expect(updates).toEqual([{ id: 'z-late' }]);
  });

  it('ne rejette jamais', async () => {
    const broken = { message: { findMany: async () => { throw new Error('mongo down'); } } } as unknown as PrismaClient;
    await expect(backfillCaptureNoticeDeadlines(broken)).resolves.toBe(0);
  });
});
