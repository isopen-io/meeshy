/**
 * #13100 — troisième audit adversarial, témoin (rouge avant son correctif) : vue unique brûlée (AttachmentService.deleteAttachment :
 * ligne supprimée, fichier scellé effacé, `forgetSealing` de sa ligne) APRÈS la vérification
 * T8 des porteurs et AVANT `erasePendingUnderHeldLock`. La ligne de scellement qui portait
 * `replacedKey` est partie : le CLAIR d'origine (nom d'origine dans le chemin) n'est plus jamais
 * effacé, ni par le scellement ni par le balayage.
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

import { sealAttachmentFiles, finishPendingErasures } from '../atRest/sealAttachmentFiles';
import { type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';

const CONV = 'dddddddddddddddddddddd01';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const K1 = '2026/10/68f2a81417a557e8ce4ddfc1/photo_secrete_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
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

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'burn-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('vue unique brûlée pendant la fin du scellement', () => {
  it('le clair d’origine ne survit pas sur le disque', async () => {
    await fs.mkdir(path.dirname(path.join(root, K1)), { recursive: true });
    await fs.writeFile(path.join(root, K1), Buffer.concat([Buffer.from('SECRET-'), crypto.randomBytes(4000)]));
    const access = memoryAccess();
    const rows: Row[] = [{ id: ID, filePath: K1, fileUrl: K1, thumbnailPath: null, thumbnailUrl: null, imageVariants: null, avifVariants: null, renditions: null, translations: null, isEncrypted: false, encryptionMode: null, processingState: 'ready' }];
    const burn = async () => {
      const row = rows.find((r) => r.id === ID);
      if (!row) return;
      rows.splice(rows.indexOf(row), 1);
      await fs.unlink(path.join(root, row.filePath)).catch(() => undefined);
      await access.store.remove(row.filePath);
    };
    let repointed = false;
    const prisma = {
      messageAttachment: {
        findUnique: async ({ where }: { where: { id: string } }) => { const r = rows.find((x) => x.id === where.id); return r ? { ...r } : null; },
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          const hit = rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
          // Le contrôle T8 (« qui désigne encore l'ancien original ? ») vient de répondre : la vue unique brûle maintenant.
          if (repointed && where.filePath === K1) await burn();
          return hit;
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const hit = rows.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          repointed = true;
          return { count: hit.length };
        },
      },
      message: {},
    };
    await sealAttachmentFiles({ prisma: prisma as never, uploadRoot: root, access }, { attachmentId: ID, conversationId: CONV });
    await finishPendingErasures({ prisma: prisma as never, uploadRoot: root, access }, ID);
    const plainLeft = await fs.stat(path.join(root, K1)).then(() => true, () => false);
    expect({ rows: rows.length, plainLeft }).toEqual({ rows: 0, plainLeft: false });
  });
});
