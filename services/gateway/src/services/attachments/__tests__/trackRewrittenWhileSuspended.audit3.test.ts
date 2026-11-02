/**
 * #13100 — troisième audit adversarial, témoin (rouge avant son correctif) : `AT_REST_FILE_SEALING=off` (première étape du retour
 * arrière) puis une piste TTS RÉÉCRITE (retraduction de la même langue) : le clair prend
 * l'adresse d'un `rename`, mais la ligne de scellement de l'ancienne piste reste. La piste
 * neuve n'est plus lisible par la passerelle (elle tente de la déchiffrer).
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

import { writeTranslatedTrack } from '../atRest/translatedTrackWrite';
import { readStoredFileBytes, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';

const CONV = 'dddddddddddddddddddddd01';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ORIGINAL = '2026/10/68f2a81417a557e8ce4ddfc1/0123456789abcdef0123456789abcdef.m4a';
const TRACK = `translated/${ID}_en.m4a`;
const DATA_KEY = crypto.randomBytes(32);

function memoryAccess(): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: {
      find: async (key) => records.get(key) ?? null,
      save: async (record) => { records.set(record.storageKey, record); },
      remove: async (key) => { records.delete(key); },
      ofAttachment: async (attachmentId) => [...records.values()].filter((r) => r.attachmentId === attachmentId),
      replacingSince: async () => [],
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }), fileOpeningKey: async () => DATA_KEY },
  };
}

let root: string;
const previous = process.env.AT_REST_FILE_SEALING;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'off-')); });
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.AT_REST_FILE_SEALING; else process.env.AT_REST_FILE_SEALING = previous;
});

describe('piste réécrite pendant que le scellement est suspendu', () => {
  it('la piste neuve se relit telle qu’écrite', async () => {
    const access = memoryAccess();
    const row = { id: ID, filePath: ORIGINAL, isEncrypted: false, encryptionMode: null, message: { conversationId: CONV, conversation: { encryptionMode: 'server', encryptionEnabledAt: new Date() } } };
    const prisma = { messageAttachment: { findUnique: async () => row }, message: {} };
    // L'original est scellé : la piste le sera aussi (une piste ne se scelle que derrière son original).
    access.records.set(ORIGINAL, { storageKey: ORIGINAL, conversationId: CONV, attachmentId: ID, keyId: 'k1', role: 'original', plaintextSize: 1, format: 'x', segmentSize: 65536, replacedKey: null });
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: crypto.randomBytes(3000), attachmentId: ID, language: 'en', uploadRoot: root, access });
    expect(access.records.has(TRACK)).toBe(true);

    process.env.AT_REST_FILE_SEALING = 'off';
    const fresh = crypto.randomBytes(5000);
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: fresh, attachmentId: ID, language: 'en', uploadRoot: root, access });

    const read = await readStoredFileBytes(path.join(root, TRACK), { uploadRoot: root, access }).then((b) => b.equals(fresh), (e: Error) => e.message);
    expect(read).toBe(true);
  });
});
