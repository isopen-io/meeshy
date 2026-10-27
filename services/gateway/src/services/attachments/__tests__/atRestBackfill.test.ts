/**
 * #13100 — le rattrapage scelle les pièces des conversations `server` /
 * `hybrid` déposées en clair, par le site de l'envoi. À blanc, il ne fait que
 * compter : ni base ni disque ne changent. Rejoué, il ne rescelle rien.
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

import { backfillAtRestAttachments } from '../atRest/atRestBackfill';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';

const SERVER_CONV = 'dddddddddddddddddddddd01';
const PLAIN_CONV = 'dddddddddddddddddddddd02';
const E2EE_CONV = 'dddddddddddddddddddddd03';
const DIR = '2026/09/68f2a81417a557e8ce4ddfc1';

type Row = Record<string, unknown> & { id: string };

function world(uploadRoot: string) {
  const writes: string[] = [];
  const records = new Map<string, AtRestFileRecord>();
  const conversations: Row[] = [
    { id: SERVER_CONV, encryptionMode: 'server', encryptionEnabledAt: new Date() },
    { id: 'dddddddddddddddddddddd04', encryptionMode: 'hybrid', encryptionEnabledAt: null },
    { id: E2EE_CONV, encryptionMode: 'e2ee', encryptionEnabledAt: new Date() },
    { id: PLAIN_CONV, encryptionMode: null, encryptionEnabledAt: null },
  ];
  const messages: Row[] = [
    { id: 'bbbbbbbbbbbbbbbbbbbbbbb1', conversationId: SERVER_CONV },
    { id: 'bbbbbbbbbbbbbbbbbbbbbbb2', conversationId: PLAIN_CONV },
  ];
  const piece = (id: string, messageId: string, name: string): Row => ({
    id, messageId, filePath: `${DIR}/${name}`, fileUrl: `${DIR}/${name}`, thumbnailPath: null, thumbnailUrl: null,
    imageVariants: null, avifVariants: null, renditions: null, translations: null, isEncrypted: false, encryptionMode: null, processingState: null,
  });
  const attachments: Row[] = [
    piece('aaaaaaaaaaaaaaaaaaaaaaa1', 'bbbbbbbbbbbbbbbbbbbbbbb1', 'photo_0f8fad5b-d9cb-469f-a165-70867728950e.png'),
    piece('aaaaaaaaaaaaaaaaaaaaaaa2', 'bbbbbbbbbbbbbbbbbbbbbbb2', 'autre_1b9d4c3e-8a7b-4f5e-9d3c-2b1a5f0c2e7a.png'),
  ];
  const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && 'in' in (value as object)) return ((value as { in: unknown[] }).in).includes(row[key]);
    return row[key] === value;
  });
  const table = (rows: Row[], name: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where)).map((row) => ({ ...row })),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      writes.push(name);
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
  });
  const access: AtRestFileAccess = {
    store: {
      find: async (key) => records.get(key) ?? null,
      save: async (record) => { writes.push('AttachmentFileAtRest'); records.set(record.storageKey, record); },
      remove: async (key) => { records.delete(key); },
      ofAttachment: async (attachmentId) => [...records.values()].filter((record) => record.attachmentId === attachmentId),
      replacingSince: async () => [],
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: crypto.randomBytes(32) }), fileOpeningKey: async () => Buffer.alloc(32) },
  };
  return {
    writes,
    records,
    attachments,
    deps: {
      prisma: { conversation: table(conversations, 'Conversation'), message: table(messages, 'Message'), messageAttachment: table(attachments, 'MessageAttachment') } as never,
      uploadRoot,
      access,
    },
  };
}

let uploadRoot: string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('PHOTO-DE-FAMILLE'), crypto.randomBytes(500)]);

beforeEach(async () => {
  uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'at-rest-backfill-'));
  await fs.mkdir(path.join(uploadRoot, DIR), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, DIR, 'photo_0f8fad5b-d9cb-469f-a165-70867728950e.png'), PNG);
  await fs.writeFile(path.join(uploadRoot, DIR, 'autre_1b9d4c3e-8a7b-4f5e-9d3c-2b1a5f0c2e7a.png'), PNG);
});
afterEach(async () => { await fs.rm(uploadRoot, { recursive: true, force: true }); });

describe('le rattrapage du scellement au repos', () => {
  it('à blanc, il compte et n’écrit rien, ni en base ni sur le disque', async () => {
    const { deps, writes } = world(uploadRoot);
    const before = (await fs.readdir(path.join(uploadRoot, DIR))).sort();
    const report = await backfillAtRestAttachments(deps, { dryRun: true, log: () => undefined });
    expect(report).toMatchObject({ conversations: 1, pieces: 1, toSeal: 1, filesToSeal: 1, sealed: 0 });
    expect(writes).toEqual([]);
    expect((await fs.readdir(path.join(uploadRoot, DIR))).sort()).toEqual(before);
  });

  it('avec --apply, seule la pièce de la conversation server activée est scellée', async () => {
    const { deps, attachments } = world(uploadRoot);
    const report = await backfillAtRestAttachments(deps, { dryRun: false, log: () => undefined });
    expect(report).toMatchObject({ sealed: 1, failed: 0 });
    const names = await fs.readdir(path.join(uploadRoot, DIR));
    const bytes = await Promise.all(names.map((name) => fs.readFile(path.join(uploadRoot, DIR, name))));
    expect(bytes.filter((b) => b.includes(Buffer.from('PHOTO-DE-FAMILLE'))).length).toBe(1);
    expect(attachments[0].filePath).toMatch(/\/[0-9a-f]{32}\.png$/);
    expect(attachments[1].filePath).toContain('autre_');
  });

  it('rejoué, il ne rescelle rien', async () => {
    const { deps } = world(uploadRoot);
    await backfillAtRestAttachments(deps, { dryRun: false, log: () => undefined });
    const again = await backfillAtRestAttachments(deps, { dryRun: false, log: () => undefined });
    expect(again).toMatchObject({ toSeal: 0, alreadySealed: 1, sealed: 0 });
  });

  it('ne journalise ni nom de fichier ni chemin', async () => {
    const { deps } = world(uploadRoot);
    const lines: string[] = [];
    await backfillAtRestAttachments(deps, { dryRun: false, log: (line) => lines.push(line) });
    expect(lines.join('\n')).not.toMatch(/photo|\.png|2026\//);
  });
});
