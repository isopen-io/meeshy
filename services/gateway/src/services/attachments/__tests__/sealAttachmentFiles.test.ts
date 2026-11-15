/**
 * #13100 — sceller une pièce `server` / `hybrid` scelle TOUT ce qu'elle a fait
 * naître sur le disque, sous un nom qui ne dit plus rien, et repointe chaque
 * ligne qui partage ses octets. Idempotent, convergent sous la concurrence, et
 * jamais appliqué à une pièce chiffrée de bout en bout.
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

import { sealAttachmentFiles, sealAttachmentIfAtRest, type SealAttachmentDeps } from '../atRest/sealAttachmentFiles';
import { isSealedStorageKey, openSealedStoredBytes, readStoredFileBytes, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';
import { writeTranslatedTrack } from '../atRest/translatedTrackWrite';

const CONV = 'dddddddddddddddddddddd01';
const DIR = '2026/10/68f2a81417a557e8ce4ddfc1';
const BASE = `${DIR}/passeport_de_jean_0f8fad5b-d9cb-469f-a165-70867728950e`;
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
      ofAttachment: async (attachmentId) => [...records.values()].filter((record) => record.attachmentId === attachmentId),
      replacingSince: async () => [],
    },
    keyring: {
      fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }),
      fileOpeningKey: async () => DATA_KEY,
    },
  };
}

const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);

function memoryPrisma(rows: Row[], regime: { encryptionMode: string; encryptionEnabledAt: Date | null } = { encryptionMode: 'server', encryptionEnabledAt: new Date() }) {
  return {
    rows,
    messageAttachment: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row, message: { conversationId: CONV, conversation: regime } } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    message: {},
  };
}

let uploadRoot: string;
const write = async (key: string, bytes: Buffer) => {
  await fs.mkdir(path.dirname(path.join(uploadRoot, key)), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, key), bytes);
};
const bytesOf = (label: string) => Buffer.concat([Buffer.from(`SECRET-${label}-`, 'ascii'), crypto.randomBytes(3000)]);

const photo = (over: Partial<Row> = {}): Row => ({
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  filePath: `${BASE}.JPG`,
  fileUrl: `${BASE}.JPG`,
  fileName: 'passeport_de_jean.JPG',
  thumbnailPath: `${BASE}_thumb.webp`,
  thumbnailUrl: `${BASE}_thumb.webp`,
  imageVariants: [{ width: 640, url: `${BASE}_640w.webp` }],
  avifVariants: [{ width: 640, url: `/api/v1/attachments/file/${BASE}_640w.avif` }],
  renditions: [{ codec: 'heic', url: `${BASE}_original.heic` }],
  translations: null,
  isEncrypted: false,
  encryptionMode: null,
  processingState: null,
  ...over,
});

const FILES = ['.JPG', '_thumb.webp', '_640w.webp', '_640w.avif', '_original.heic'];

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : Promise.resolve([path.join(dir, entry.name)]))));
  return nested.flat();
}

const allBytesOnDisk = async (): Promise<Buffer[]> => Promise.all((await filesUnder(uploadRoot)).map((file) => fs.readFile(file)));

const reopen = async (record: AtRestFileRecord, access: AtRestFileAccess) => readStoredFileBytes(path.join(uploadRoot, record.storageKey), { uploadRoot, access });

beforeEach(async () => {
  uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-attachment-'));
  await Promise.all(FILES.map((suffix) => write(`${BASE}${suffix}`, bytesOf(suffix))));
});
afterEach(async () => { await fs.rm(uploadRoot, { recursive: true, force: true }); });

const depsOf = (prisma: ReturnType<typeof memoryPrisma>, access: AtRestFileAccess): SealAttachmentDeps =>
  ({ prisma: prisma as never, uploadRoot, access });

describe('sceller une pièce scelle tout ce qu’elle a fait naître', () => {
  it('original, vignette, variantes WebP et AVIF, original HEIC : plus un octet clair, plus le nom', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()]);
    const outcome = await sealAttachmentFiles(depsOf(prisma, access), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV });
    expect(outcome).toEqual({ status: 'sealed', files: 5, rows: 1 });

    const disk = await allBytesOnDisk();
    expect(disk.some((bytes) => bytes.includes(Buffer.from('SECRET-')))).toBe(false);
    const names = await fs.readdir(path.join(uploadRoot, DIR));
    expect(names.some((name) => name.includes('passeport'))).toBe(false);
    expect(names.sort()).toEqual(expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{32}\.jpg$/), expect.stringMatching(/^[0-9a-f]{32}_thumb\.webp$/)]));

    const row = prisma.rows[0];
    expect(isSealedStorageKey(row.filePath)).toBe(true);
    expect(row.fileUrl).toBe(row.filePath);
    expect(row.fileName).toBe(path.basename(row.filePath));
    expect((row.avifVariants as Array<{ url: string }>)[0].url).toMatch(/^2026\/10\/[0-9a-f]{24}\/[0-9a-f]{32}_640w\.avif$/);
    expect([...access.records.values()].map((r) => r.role).sort()).toEqual(['avif-640', 'original', 'rendition-heic', 'thumbnail', 'webp-640']);
    for (const record of access.records.values()) {
      expect((await reopen(record, access)).subarray(0, 7).toString('ascii')).toBe('SECRET-');
    }
  });

  it('les copies qui partagent les octets sont repointées, et leurs pistes scellées en place', async () => {
    const access = memoryAccess();
    const track = `translated/aaaaaaaaaaaaaaaaaaaaaaa2_en.m4a`;
    await write(track, bytesOf('track'));
    const prisma = memoryPrisma([
      photo(),
      photo({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2', translations: { en: { url: `/api/v1/attachments/file/${track}`, path: path.join(uploadRoot, track) } } }),
    ]);
    await sealAttachmentFiles(depsOf(prisma, access), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV });
    expect(prisma.rows[0].filePath).toBe(prisma.rows[1].filePath);
    expect(prisma.rows[1].thumbnailPath).toBe(prisma.rows[0].thumbnailPath);
    expect(access.records.get(track)?.role).toBe('track-en');
    expect((await fs.readFile(path.join(uploadRoot, track))).includes(Buffer.from('SECRET-track'))).toBe(false);
    expect((await reopen(access.records.get(track)!, access)).subarray(0, 12).toString('ascii')).toBe('SECRET-track');
  });

  it('rejouer ne rescelle rien, et une piste arrivée ensuite est scellée en place', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()]);
    const deps = depsOf(prisma, access);
    await sealAttachmentFiles(deps, { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV });
    const sealedKey = prisma.rows[0].filePath;
    expect(await sealAttachmentFiles(deps, { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV })).toEqual({ status: 'already-sealed' });
    expect(prisma.rows[0].filePath).toBe(sealedKey);

    const track = `translated/aaaaaaaaaaaaaaaaaaaaaaa1_es.m4a`;
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(uploadRoot, track), bytes: bytesOf('pista'), attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', language: 'es', uploadRoot, access });
    expect(access.records.get(track)?.role).toBe('track-es');
    expect((await fs.readFile(path.join(uploadRoot, track))).includes(Buffer.from('SECRET-pista'))).toBe(false);
    expect((await fs.readdir(path.join(uploadRoot, 'translated'))).filter((name) => name.startsWith('.'))).toEqual([]);
  });

  it('deux scellements concurrents convergent sur les mêmes fichiers, lisibles', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()]);
    const deps = depsOf(prisma, access);
    const outcomes = await Promise.allSettled([
      sealAttachmentFiles(deps, { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV }),
      sealAttachmentFiles(deps, { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV }),
    ]);
    expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true);
    expect((await allBytesOnDisk()).some((bytes) => bytes.includes(Buffer.from('SECRET-')))).toBe(false);
    const original = access.records.get(prisma.rows[0].filePath)!;
    expect((await reopen(original, access)).subarray(0, 11).toString('ascii')).toBe('SECRET-.JPG');
  });
});

describe('ce qui ne se scelle pas', () => {
  it('une pièce chiffrée de bout en bout n’est jamais touchée', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo({ isEncrypted: true, encryptionMode: 'e2ee' })]);
    expect(await sealAttachmentFiles(depsOf(prisma, access), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV }))
      .toEqual({ status: 'skipped', reason: 'end-to-end' });
    expect(access.records.size).toBe(0);
  });

  it('un rendu en cours attend sa fin', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo({ processingState: 'pending' })]);
    expect(await sealAttachmentFiles(depsOf(prisma, access), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV }))
      .toEqual({ status: 'skipped', reason: 'pending' });
  });

  it('une conversation sans chiffrement au repos, ni original scellé', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()], { encryptionMode: 'server', encryptionEnabledAt: null });
    expect(await sealAttachmentIfAtRest(depsOf(prisma, access), 'aaaaaaaaaaaaaaaaaaaaaaa1')).toEqual({ status: 'skipped', reason: 'not-at-rest' });
    const plain = memoryPrisma([photo()], { encryptionMode: 'e2ee', encryptionEnabledAt: new Date() });
    expect(await sealAttachmentIfAtRest(depsOf(plain, access), 'aaaaaaaaaaaaaaaaaaaaaaa1')).toEqual({ status: 'skipped', reason: 'not-at-rest' });
  });

  it('une piste d’une pièce ordinaire reste en clair à son adresse', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()], { encryptionMode: 'server', encryptionEnabledAt: null });
    const track = 'translated/aaaaaaaaaaaaaaaaaaaaaaa1_de.m4a';
    const bytes = bytesOf('spur');
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(uploadRoot, track), bytes, attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', language: 'de', uploadRoot, access });
    expect((await fs.readFile(path.join(uploadRoot, track))).equals(bytes)).toBe(true);
    expect(access.records.size).toBe(0);
  });
});

describe('le clair ne sort que pour la passerelle', () => {
  it('readStoredFileBytes refuse une forme scellée sans accès configuré', async () => {
    const key = `${DIR}/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.jpg`;
    await write(key, crypto.randomBytes(100));
    await expect(readStoredFileBytes(path.join(uploadRoot, key), { uploadRoot, access: null })).rejects.toThrow();
  });

  it('un en-tête de chiffré recopié dans un fichier déposé ne fait rien ouvrir', async () => {
    const access = memoryAccess();
    const prisma = memoryPrisma([photo()]);
    await sealAttachmentFiles(depsOf(prisma, access), { attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: CONV });
    const sealedBytes = await fs.readFile(path.join(uploadRoot, prisma.rows[0].filePath));
    const uploaded = `${DIR}/copie_1b9d4c3e-8a7b-4f5e-9d3c-2b1a5f0c2e7a.jpg`;
    await write(uploaded, sealedBytes);
    expect((await readStoredFileBytes(path.join(uploadRoot, uploaded), { uploadRoot, access })).equals(sealedBytes)).toBe(true);
    const record = access.records.get(prisma.rows[0].filePath)!;
    const { Readable } = await import('stream');
    const cipher = { size: sealedBytes.length, etag: '', open: async (range?: { start: number; end: number }) => Readable.from([range ? sealedBytes.subarray(range.start, range.end + 1) : sealedBytes]) };
    await expect(openSealedStoredBytes(cipher, { ...record, attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa9' }, access.keyring).open()).rejects.toThrow();
    await expect(openSealedStoredBytes(cipher, { ...record, conversationId: 'dddddddddddddddddddddd02' }, access.keyring).open()).rejects.toThrow();
    expect(await openSealedStoredBytes(cipher, record, access.keyring).open()).not.toBeNull();
  });
});
