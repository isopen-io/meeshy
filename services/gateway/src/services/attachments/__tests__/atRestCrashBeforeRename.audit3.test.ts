/**
 * #13100 — troisième audit adversarial, témoin (rouge avant son correctif) : processus tué entre `store.save` et `fs.rename`
 * (sealStoredFile, original sous clé neuve). Le balayage (`finishPendingErasures`)
 * repointe les lignes vers une clé ABSENTE du disque et efface le clair : la pièce est perdue.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { finishPendingErasures } from '../atRest/sealAttachmentFiles';
import { opaqueBaseFor, sealStoredFile, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';

const CONV = 'dddddddddddddddddddddd01';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const K1 = '2026/10/68f2a81417a557e8ce4ddfc1/passeport_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
const DATA_KEY = crypto.randomBytes(32);

type Row = Record<string, unknown> & { id: string; filePath: string };

function memoryAccess(): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: {
      find: async (key) => records.get(key) ?? null,
      save: async (record) => { records.set(record.storageKey, record); },
      remove: async (key) => { records.delete(key); },
      ofAttachment: async (attachmentId) => [...records.values()].filter((r) => r.attachmentId === attachmentId),
      byReplacedKey: async (k) => [...records.values()].find((r) => r.replacedKey === k && r.role === 'original') ?? null,
      replacingSince: async () => [...new Set([...records.values()].filter((r) => r.replacedKey).map((r) => r.attachmentId))],
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }), fileOpeningKey: async () => DATA_KEY },
  };
}

const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
function memoryPrisma(rows: Row[]) {
  return {
    messageAttachment: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    message: {},
  };
}

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'crash-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('processus tué entre la ligne de scellement et le rename', () => {
  it('le balayage ne repointe jamais une ligne vers un fichier absent, et n’efface pas le seul clair', async () => {
    const plain = Buffer.concat([Buffer.from('SECRET-'), crypto.randomBytes(5000)]);
    await fs.mkdir(path.dirname(path.join(root, K1)), { recursive: true });
    await fs.writeFile(path.join(root, K1), plain);
    const access = memoryAccess();
    const K2 = `${opaqueBaseFor(K1)}.jpg`;
    await sealStoredFile({ uploadRoot: root, sourceKey: K1, targetKey: K2, binding: { conversationId: CONV, attachmentId: ID, role: 'original' }, access, replacedKey: K1 });
    // État disque exact d'un processus tué après `store.save` et avant `fs.rename` : le chiffré est encore sous son nom caché.
    await fs.rename(path.join(root, K2), path.join(path.dirname(path.join(root, K2)), '.sealing-deadbeefdeadbeef'));

    const rows: Row[] = [{ id: ID, filePath: K1, fileUrl: K1, thumbnailPath: null, thumbnailUrl: null, imageVariants: null, avifVariants: null, renditions: null, translations: null, isEncrypted: false, encryptionMode: null, processingState: 'ready' }];
    await finishPendingErasures({ prisma: memoryPrisma(rows) as never, uploadRoot: root, access }, ID);

    const served = path.join(root, rows[0].filePath);
    const readable = await fs.stat(served).then(() => true, () => false);
    const plainSurvives = await fs.stat(path.join(root, K1)).then(() => true, () => false);
    expect({ pointsTo: rows[0].filePath, readable, plainSurvives }).toEqual({ pointsTo: rows[0].filePath, readable: true, plainSurvives: true });
    expect(readable || plainSurvives).toBe(true);
  });
});
