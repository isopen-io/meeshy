/**
 * #13100 / #13102 — second audit adversarial : un témoin par constat (T1–T8,
 * M3), rouges avant leurs correctifs.
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';

const mockErrors: unknown[] = [];
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: (...a: unknown[]) => { mockErrors.push(a); }, warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { sealAttachmentFiles, type SealAttachmentDeps } from '../atRest/sealAttachmentFiles';
import { configureAtRestFileAccess, readStoredFileBytes, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';
import { SealingStillEnabledError, unsealAllAtRestFiles } from '../atRest/atRestUnseal';
import { writeTranslatedTrack } from '../atRest/translatedTrackWrite';
import { sealMessageAttachmentsAtRest } from '../../messaging/sealMessageAttachments';
import { locateStoredBytes } from '../../../routes/attachments/storedBytes';
import { configureTranslatorForget, forgetAtTranslator, translatorForget } from '../../translatorForget';

const CONV = 'dddddddddddddddddddddd01';
const KEY = crypto.randomBytes(32);
const A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const DIR = '2026/10/68f2a81417a557e8ce4ddfc1';
const OLD = `${DIR}/passeport_0f8fad5b-d9cb-469f-a165-70867728950e.jpg`;
const SECRET = Buffer.concat([Buffer.from('SECRET-PASSEPORT-', 'ascii'), crypto.randomBytes(100_000)]);

type Row = Record<string, unknown> & { id: string; filePath: string };
const row = (over: Partial<Row> = {}): Row => ({
  id: A, messageId: MSG, filePath: OLD, fileUrl: OLD, thumbnailPath: null, thumbnailUrl: null,
  imageVariants: null, avifVariants: null, renditions: null, translations: null,
  isEncrypted: false, encryptionMode: null, processingState: null,
  message: { conversationId: CONV, conversation: { encryptionMode: 'server', encryptionEnabledAt: new Date() } },
  ...over,
});

function access(hooks: { onSave?: (r: AtRestFileRecord) => Promise<void> } = {}): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: {
      find: async (k) => records.get(k) ?? null,
      save: async (r) => { records.set(r.storageKey, r); await hooks.onSave?.(r); },
      remove: async (k) => { records.delete(k); },
      ofAttachment: async (id) => [...records.values()].filter((r) => r.attachmentId === id),
      replacingSince: async () => [],
      byReplacedKey: async (k) => [...records.values()].find((r) => r.replacedKey === k && r.role === 'original') ?? null,
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: KEY }), fileOpeningKey: async () => KEY },
  };
}
const matches = (r: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);
function prismaOf(rows: Row[]) {
  return {
    messageAttachment: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length };
      },
    },
    message: {},
  };
}

let root: string;
beforeEach(async () => {
  mockErrors.length = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit2-'));
  await fs.mkdir(path.join(root, DIR), { recursive: true });
  await fs.writeFile(path.join(root, OLD), SECRET);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('T1 — retour arrière : la passerelle vivante rescelle ce que la migration inverse a rouvert', () => {
  const previous = process.env.AT_REST_FILE_SEALING;
  afterEach(() => {
    if (previous === undefined) delete process.env.AT_REST_FILE_SEALING;
    else process.env.AT_REST_FILE_SEALING = previous;
  });

  it('le retour arrière refuse de rouvrir tant que le scellement n’est pas suspendu', async () => {
    const rows = [row()];
    const a = access();
    await sealAttachmentFiles({ prisma: prismaOf(rows) as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    delete process.env.AT_REST_FILE_SEALING;
    await expect(unsealAllAtRestFiles({ uploadRoot: root, access: a, records: async () => [...a.records.values()] }, { dryRun: false, log: () => undefined }))
      .rejects.toBeInstanceOf(SealingStillEnabledError);
    expect((await fs.readFile(path.join(root, rows[0].filePath))).equals(SECRET)).toBe(false);
  });

  it('scellement suspendu : après unseal, envoi et balayage laissent le fichier EN CLAIR', async () => {
    const rows = [row()];
    const a = access();
    const deps: SealAttachmentDeps = { prisma: prismaOf(rows) as never, uploadRoot: root, access: a };
    await sealAttachmentFiles(deps, { attachmentId: A, conversationId: CONV });
    process.env.AT_REST_FILE_SEALING = 'off';
    await unsealAllAtRestFiles({ uploadRoot: root, access: a, records: async () => [...a.records.values()] }, { dryRun: false, log: () => undefined });
    expect((await fs.readFile(path.join(root, rows[0].filePath))).equals(SECRET)).toBe(true);
    expect(await sealAttachmentFiles(deps, { attachmentId: A, conversationId: CONV })).toEqual({ status: 'skipped', reason: 'suspended' });
    expect((await fs.readFile(path.join(root, rows[0].filePath))).equals(SECRET)).toBe(true);
  });

  it('rouvert puis tué avant le retrait de la ligne : rejouer retire la ligne, sans rien rechiffrer ni échouer', async () => {
    const rows = [row()];
    const a = access();
    await sealAttachmentFiles({ prisma: prismaOf(rows) as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    const sealedKey = rows[0].filePath;
    process.env.AT_REST_FILE_SEALING = 'off';
    await fs.writeFile(path.join(root, sealedKey), SECRET);
    const report = await unsealAllAtRestFiles({ uploadRoot: root, access: a, records: async () => [...a.records.values()] }, { dryRun: false, log: () => undefined });
    expect(report.failed).toBe(0);
    expect(a.records.has(sealedKey)).toBe(false);
    expect((await fs.readFile(path.join(root, sealedKey))).equals(SECRET)).toBe(true);
  });
});

describe('T2 — verrou injoignable : la pièce reste en clair, SANS une ligne de journal', () => {
  it('sealMessageAttachmentsAtRest avec Redis en panne ne scelle pas et ne le dit pas', async () => {
    const rows = [row()];
    const deps: SealAttachmentDeps = { prisma: prismaOf(rows) as never, uploadRoot: root, access: access(), lock: async () => { throw new Error('Connection is closed.'); } };
    await sealMessageAttachmentsAtRest(deps, { messageId: MSG, conversationId: CONV });
    const stillClear = (await fs.readFile(path.join(root, OLD)).catch(() => Buffer.alloc(0))).equals(SECRET);
    expect(stillClear && mockErrors.length === 0).toBe(false);
  });
});

describe('T3 — l’oubli au translator bloque l’effacement quand l’envoi ZMQ ne rend pas la main', () => {
  it('forgetAtTranslator doit rendre la main même si le socket PUSH est plein', async () => {
    configureTranslatorForget(translatorForget({ store: null, send: () => new Promise<void>(() => undefined) }));
    try {
      const outcome = await Promise.race([
        forgetAtTranslator({ attachmentIds: [A] }).then(() => 'returned'),
        new Promise((r) => setTimeout(() => r('hung'), 500)),
      ]);
      expect(outcome).toBe('returned');
    } finally {
      configureTranslatorForget(null);
    }
  });
});

describe('T4 — une pièce hors de l’arborescence datée, une fois scellée, est servie CHIFFRÉE', () => {
  it('elle ne se scelle pas (la lecture ne la chercherait pas) et locateStoredBytes rend le clair', async () => {
    const legacy = 'legacy/passeport_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
    await fs.mkdir(path.join(root, 'legacy'), { recursive: true });
    await fs.writeFile(path.join(root, legacy), SECRET);
    const rows = [row({ filePath: legacy, fileUrl: legacy })];
    const a = access();
    const outcome = await sealAttachmentFiles({ prisma: prismaOf(rows) as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    expect(outcome).toEqual({ status: 'skipped', reason: 'unsealable-key' });
    expect(a.records.size).toBe(0);
    const located = await locateStoredBytes(path.join(root, rows[0].filePath), { uploadRoot: root, mirror: null, atRest: a });
    const stream = await (located as { open: () => Promise<NodeJS.ReadableStream | null> }).open();
    const parts: Buffer[] = [];
    for await (const p of stream as AsyncIterable<Buffer>) parts.push(p);
    expect(Buffer.concat(parts).equals(SECRET)).toBe(true);
  });
});

describe('T5 — une piste TTS écrite PENDANT le scellement de sa pièce est chiffrée deux fois', () => {
  it('la piste reste lisible', async () => {
    const TRACK = `translated/${A}_en.m4a`;
    const OLD_TRACK = Buffer.from('ANCIENNE-PISTE-'.repeat(2000));
    const NEW_TRACK = Buffer.from('NOUVELLE-PISTE-'.repeat(2000));
    await fs.mkdir(path.join(root, 'translated'), { recursive: true });
    await fs.writeFile(path.join(root, TRACK), OLD_TRACK);
    const rows = [row({ translations: { en: { url: `/api/v1/attachments/file/${TRACK}` } } })];
    const prisma = prismaOf(rows);
    let raced = false;
    const a = access({
      onSave: async (r) => {
        if (r.role === 'original' && !raced) {
          raced = true;
          await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: NEW_TRACK, attachmentId: A, language: 'en', uploadRoot: root, access: a });
        }
      },
    });
    await sealAttachmentFiles({ prisma: prisma as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    const served = await readStoredFileBytes(path.join(root, TRACK), { uploadRoot: root, access: a });
    expect(served.equals(NEW_TRACK)).toBe(true);
  });
});

describe('T6 — processus tué entre l’inscription du scellement et le rename (scellement EN PLACE)', () => {
  it('rejouer laisse un fichier lisible et aucun clair', async () => {
    const TRACK = `translated/${A}_en.m4a`;
    const PISTE = Buffer.from('PISTE-EN-CLAIR-'.repeat(2000));
    await fs.mkdir(path.join(root, 'translated'), { recursive: true });
    await fs.writeFile(path.join(root, TRACK), PISTE);
    const rows = [row({ translations: { en: { url: `/api/v1/attachments/file/${TRACK}` } } })];
    const prisma = prismaOf(rows);
    let killed = false;
    const a = access({ onSave: async (r) => { if (r.role === 'track-en' && !killed) { killed = true; throw new Error('SIGKILL'); } } });
    const deps: SealAttachmentDeps = { prisma: prisma as never, uploadRoot: root, access: a };
    await sealAttachmentFiles(deps, { attachmentId: A, conversationId: CONV }).catch(() => undefined);
    await sealAttachmentFiles(deps, { attachmentId: A, conversationId: CONV }).catch(() => undefined);
    const onDisk = await fs.readFile(path.join(root, TRACK));
    const readable = await readStoredFileBytes(path.join(root, TRACK), { uploadRoot: root, access: a }).then((b) => b.equals(PISTE), () => false);
    expect({ plaintextOnDisk: onDisk.equals(PISTE), readable }).toEqual({ plaintextOnDisk: false, readable: true });
  });
});

import { MediaService } from '../../MediaService';
describe('T7 — publier en story une pièce scellée (POST /posts/from-attachment) recopie le CHIFFRÉ', () => {
  it('la copie du post porte le clair', async () => {
    const rows = [row()];
    const a = access();
    await sealAttachmentFiles({ prisma: prismaOf(rows) as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    configureAtRestFileAccess(a);
    try {
      const dup = await new MediaService(root).duplicate(rows[0].fileUrl as string);
      const copied = await fs.readFile(path.join(root, dup.filePath));
      expect(copied.equals(SECRET)).toBe(true);
    } finally {
      configureAtRestFileAccess(null);
    }
  });
});

describe('T8 — une vue unique brûlée PENDANT son scellement laisse une copie scellée orpheline', () => {
  it('après l’effacement de la pièce, aucun fichier ni ligne de scellement ne reste', async () => {
    const rows = [row()];
    let burned = false;
    const a = access({
      onSave: async (r) => {
        if (r.role === 'original' && !burned) {
          burned = true;
          // AttachmentService.deleteAttachment : la ligne part, le fichier qu'elle désignait part.
          rows.splice(0, rows.length);
          await fs.unlink(path.join(root, OLD)).catch(() => undefined);
        }
      },
    });
    await sealAttachmentFiles({ prisma: prismaOf(rows) as never, uploadRoot: root, access: a }, { attachmentId: A, conversationId: CONV });
    const left = (await fs.readdir(path.join(root, DIR))).filter((n) => !n.startsWith('.'));
    expect({ files: left, records: a.records.size }).toEqual({ files: [], records: 0 });
  });
});

describe('M3 — une copie créée après l’effacement du clair remplacé désigne un fichier disparu', () => {
  it('son scellement la repointe sur l’original scellé, même hors d’une conversation au repos', async () => {
    const original = row();
    const rows = [original];
    const a = access();
    const deps: SealAttachmentDeps = { prisma: prismaOf(rows) as never, uploadRoot: root, access: a };
    await sealAttachmentFiles(deps, { attachmentId: A, conversationId: CONV });
    const sealedKey = original.filePath;
    expect(sealedKey).not.toBe(OLD);
    const COPY = 'aaaaaaaaaaaaaaaaaaaaaaa2';
    rows.push(row({ id: COPY, messageId: 'bbbbbbbbbbbbbbbbbbbbbbb2', message: { conversationId: 'dddddddddddddddddddddd02', conversation: { encryptionMode: null, encryptionEnabledAt: null } } }));
    const { sealAttachmentIfAtRest } = await import('../atRest/sealAttachmentFiles');
    await sealAttachmentIfAtRest(deps, COPY);
    expect(rows[1].filePath).toBe(sealedKey);
    expect((await readStoredFileBytes(path.join(root, rows[1].filePath), { uploadRoot: root, access: a })).equals(SECRET)).toBe(true);
  });
});
