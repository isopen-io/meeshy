/**
 * #13100 — les trois témoins rouges de l'audit adversarial du 2026-10-26 :
 * deux scellements concurrents sous deux liaisons (W1), une interruption entre
 * le repointage et l'effacement (W2), une copie de transfert créée pendant le
 * scellement (W3). Aucun ne doit perdre une pièce, ni laisser de clair.
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

import { finishPendingErasures, sealAttachmentFiles, type SealAttachmentDeps, type SealLock } from '../atRest/sealAttachmentFiles';
import { readStoredFileBytes, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';

const X1 = 'dddddddddddddddddddddd01';
const X2 = 'dddddddddddddddddddddd02';
const DIR = '2026/10/68f2a81417a557e8ce4ddfc1';
const OLD = `${DIR}/passeport_de_jean_0f8fad5b-d9cb-469f-a165-70867728950e.jpg`;
const KEYS: Record<string, Buffer> = { [X1]: crypto.randomBytes(32), [X2]: crypto.randomBytes(32) };

type Row = Record<string, unknown> & { id: string; filePath: string };

const row = (id: string): Row => ({
  id, filePath: OLD, fileUrl: OLD, thumbnailPath: null, thumbnailUrl: null,
  imageVariants: null, avifVariants: null, renditions: null, translations: null,
  isEncrypted: false, encryptionMode: null, processingState: null,
});

function access(hooks: { onSave?: (record: AtRestFileRecord) => Promise<void> } = {}): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: {
      find: async (key) => records.get(key) ?? null,
      save: async (record) => { records.set(record.storageKey, record); await hooks.onSave?.(record); },
      remove: async (key) => { records.delete(key); },
      ofAttachment: async (attachmentId) => [...records.values()].filter((record) => record.attachmentId === attachmentId),
      replacingSince: async () => [...new Set([...records.values()].filter((r) => r.role === 'original' && r.replacedKey).map((r) => r.attachmentId))],
    },
    keyring: {
      fileSealingKey: async (conversationId) => ({ keyId: `k-${conversationId}`, key: KEYS[conversationId] }),
      fileOpeningKey: async (_keyId, conversationId) => KEYS[conversationId],
    },
  };
}

const matches = (r: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);

function prismaOf(rows: Row[], hooks: { afterUpdate?: (rows: Row[]) => void } = {}) {
  return {
    rows,
    messageAttachment: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        hooks.afterUpdate?.(rows);
        return { count: hit.length };
      },
    },
    message: {},
  };
}

let uploadRoot: string;
const SECRET = Buffer.concat([Buffer.from('SECRET-PASSEPORT-', 'ascii'), crypto.randomBytes(200_000)]);
/** Le verrou de processus que Redis tient en production (`redisSealLock`). */
function memoryLock(): SealLock {
  const held = new Set<string>();
  return async (filePath) => {
    if (held.has(filePath)) return 'busy';
    held.add(filePath);
    return { release: async () => { held.delete(filePath); } };
  };
}
const LOCK = memoryLock();
const deps = (prisma: ReturnType<typeof prismaOf>, a: AtRestFileAccess): SealAttachmentDeps => ({ prisma: prisma as never, uploadRoot, access: a, lock: LOCK });

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)]))));
  return nested.flat();
}
const plaintextOnDisk = async () => (await Promise.all((await filesUnder(uploadRoot)).map((f) => fs.readFile(f)))).some((b) => b.includes(Buffer.from('SECRET-PASSEPORT-')));

beforeEach(async () => {
  uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audit13100-'));
  await fs.mkdir(path.join(uploadRoot, DIR), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, OLD), SECRET);
});
afterEach(async () => { await fs.rm(uploadRoot, { recursive: true, force: true }); });

describe('AUDIT W1 — deux scellements concurrents de liaisons DIFFÉRENTES', () => {
  it('la pièce reste lisible après un scellement par la source (X1) et un par sa copie (X2)', async () => {
    const rows = [row('aaaaaaaaaaaaaaaaaaaaaaa1'), row('bbbbbbbbbbbbbbbbbbbbbbb2')];
    const prisma = prismaOf(rows);
    let releaseA: () => void = () => undefined;
    const aBlocked = new Promise<void>((resolve) => { releaseA = resolve; });
    let firstSave = true;
    const a = access({
      onSave: async (record) => {
        if (record.attachmentId === 'aaaaaaaaaaaaaaaaaaaaaaa1' && firstSave) { firstSave = false; await aBlocked; }
      },
    });
    const sealA = sealAttachmentFiles(deps(prisma, a), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: X1 });
    await new Promise((r) => setTimeout(r, 50));
    expect(await sealAttachmentFiles(deps(prisma, a), { attachmentId: 'bbbbbbbbbbbbbbbbbbbbbbb2', conversationId: X2 })).toEqual({ status: 'skipped', reason: 'busy' });
    releaseA();
    await sealA;

    const sealedKey = rows[0].filePath;
    const read = await readStoredFileBytes(path.join(uploadRoot, sealedKey), { uploadRoot, access: a }).then(
      (bytes) => bytes.equals(SECRET),
      (error: unknown) => `illisible: ${(error as Error).message}`
    );
    expect(read).toBe(true);
  });
});

describe('AUDIT W2 — interruption entre le repointage et l’effacement', () => {
  it('rejouer le scellement efface le clair d’origine', async () => {
    const rows = [row('aaaaaaaaaaaaaaaaaaaaaaa1')];
    let crash = true;
    const prisma = prismaOf(rows, { afterUpdate: () => { if (crash) { crash = false; throw new Error('processus tué'); } } });
    const a = access();
    await sealAttachmentFiles(deps(prisma, a), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: X1 }).catch(() => undefined);
    const replay = await sealAttachmentFiles(deps(prisma, a), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: X1 });
    expect(replay).toEqual({ status: 'already-sealed' });
    expect(await plaintextOnDisk()).toBe(false);
  });
});

describe('AUDIT W3 — une copie de transfert créée PENDANT le scellement', () => {
  it('la copie garde un fichier lisible', async () => {
    const rows = [row('aaaaaaaaaaaaaaaaaaaaaaa1')];
    let inserted = false;
    const prisma = prismaOf(rows, {
      afterUpdate: (all) => { if (!inserted) { inserted = true; all.push(row('ccccccccccccccccccccccc3')); } },
    });
    const a = access();
    await sealAttachmentFiles(deps(prisma, a), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: X1 });
    const copy = rows.find((r) => r.id === 'ccccccccccccccccccccccc3')!;
    const readable = await readStoredFileBytes(path.join(uploadRoot, copy.filePath), { uploadRoot, access: a }).then(
      (bytes) => bytes.equals(SECRET),
      (error: unknown) => `perdu: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`
    );
    expect(readable).toBe(true);
    expect(await plaintextOnDisk()).toBe(false);
  });

  it('une copie apparue APRÈS l’effacement du clair se repointe encore sur le scellé', async () => {
    const rows = [row('aaaaaaaaaaaaaaaaaaaaaaa1')];
    const prisma = prismaOf(rows);
    const a = access();
    await sealAttachmentFiles(deps(prisma, a), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: X1 });
    expect(await plaintextOnDisk()).toBe(false);
    rows.push(row('ccccccccccccccccccccccc4'));
    await finishPendingErasures(deps(prisma, a), 'aaaaaaaaaaaaaaaaaaaaaaa1');
    const late = rows.find((r) => r.id === 'ccccccccccccccccccccccc4')!;
    expect(late.filePath).toBe(rows[0].filePath);
    expect((await readStoredFileBytes(path.join(uploadRoot, late.filePath), { uploadRoot, access: a })).equals(SECRET)).toBe(true);
  });
});
