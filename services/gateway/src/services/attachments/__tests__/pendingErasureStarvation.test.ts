/**
 * #13100 — le balayage des effacements en attente ne s'affame pas : une pièce
 * dont le clair remplacé est effacé est MARQUÉE et sort de la file ; les
 * suivantes, au-delà du plafond d'un passage, finissent toutes par passer.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { PENDING_ERASURE_PER_PASS, finishPendingErasuresPass } from '../../../jobs/at-rest-file-sweep';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';
import { ciphertextSizeFor } from '../atRest/sealedFileFormat';

const EXTRA = 15;
const SEGMENT = 65536;
const idOf = (i: number) => i.toString(16).padStart(24, '0');
const sealedKey = (i: number) => `2026/10/u/${i.toString(16).padStart(32, '0')}.jpg`;
const clearKey = (i: number) => `2026/10/u/clair_${i}.jpg`;

type Row = { id: string; filePath: string } & Record<string, unknown>;

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'starve-')); await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true }); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('les effacements en attente', () => {
  it(`${PENDING_ERASURE_PER_PASS}+${EXTRA} pièces dont les premières sont déjà effacées : toutes finissent par être traitées`, async () => {
    const total = PENDING_ERASURE_PER_PASS + EXTRA;
    const records: AtRestFileRecord[] = [];
    const erasedAt = new Map<string, Date>();
    const rows: Row[] = [];
    for (let i = 0; i < total; i += 1) {
      records.push({ storageKey: sealedKey(i), conversationId: 'd'.repeat(24), attachmentId: idOf(i), keyId: 'k1', role: 'original', plaintextSize: 0, format: 'x', segmentSize: SEGMENT, replacedKey: clearKey(i) });
      rows.push({ id: idOf(i), filePath: sealedKey(i) });
      await fs.writeFile(path.join(root, sealedKey(i)), Buffer.alloc(ciphertextSizeFor(0, SEGMENT)));
      // Les premières : leur clair est déjà parti (effacées avant ce lot, sans marque).
      if (i >= PENDING_ERASURE_PER_PASS) await fs.writeFile(path.join(root, clearKey(i)), 'CLAIR');
    }
    const access: AtRestFileAccess = {
      store: {
        find: async (k) => records.find((r) => r.storageKey === k) ?? null,
        save: async () => undefined,
        remove: async () => undefined,
        ofAttachment: async (id) => records.filter((r) => r.attachmentId === id),
        replacingSince: async () => records.filter((r) => !erasedAt.has(r.attachmentId)).map((r) => r.attachmentId),
        markReplacedErased: async (id) => { erasedAt.set(id, new Date()); },
      },
      keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: Buffer.alloc(32) }), fileOpeningKey: async () => Buffer.alloc(32) },
    };
    const prisma = {
      messageAttachment: {
        findMany: async ({ where }: { where: { filePath: string } }) => rows.filter((r) => r.filePath === where.filePath).map((r) => ({ ...r })),
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => null,
      },
      message: {},
    };
    const deps = { prisma: prisma as never, uploadRoot: root, access };
    await finishPendingErasuresPass(deps, new Date(0));
    await finishPendingErasuresPass(deps, new Date(0));
    expect(erasedAt.size).toBe(total);
    const left = await Promise.all(Array.from({ length: EXTRA }, (_, k) => fs.stat(path.join(root, clearKey(PENDING_ERASURE_PER_PASS + k))).then(() => true, () => false)));
    expect(left.filter(Boolean)).toEqual([]);
  });
});
