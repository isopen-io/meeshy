/**
 * #13100 — une piste TTS écrite PENDANT le scellement de son original : son
 * état scellé se lit SOUS le verrou de l'original, jamais avant. Le scellement
 * qui finit entre-temps donne une piste scellée, jamais une piste en clair à
 * côté d'un original scellé.
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
import { SealLockUnavailableError } from '../atRest/sealLock';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const CONV = 'dddddddddddddddddddddd01';
const ORIGINAL = '2026/10/u/vocal_0f8fad5b-d9cb-469f-a165-70867728950e.m4a';
const TRACK = `translated/${ID}_en.m4a`;
const DATA_KEY = crypto.randomBytes(32);

const sealedOriginal: AtRestFileRecord = { storageKey: ORIGINAL, conversationId: CONV, attachmentId: ID, keyId: 'k1', role: 'original', plaintextSize: 1, format: 'x', segmentSize: 65536, replacedKey: null };
const row = (mode: string | null) => ({ id: ID, filePath: ORIGINAL, isEncrypted: false, encryptionMode: null, message: { conversationId: CONV, conversation: { encryptionMode: mode, encryptionEnabledAt: mode ? new Date() : null } } });

function accessWith(lock: AtRestFileAccess['lock']) {
  const records = new Map<string, AtRestFileRecord>();
  const access: AtRestFileAccess = {
    store: { find: async (k) => records.get(k) ?? null, save: async (r) => { records.set(r.storageKey, r); }, remove: async (k) => { records.delete(k); }, ofAttachment: async () => [], replacingSince: async () => [] },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }), fileOpeningKey: async () => DATA_KEY },
    lock,
  };
  return { access, records };
}

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'trackrace-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('une piste écrite pendant le scellement de son original', () => {
  it('le scellement intercalé finit sous le verrou : la piste est scellée', async () => {
    const sealer = { holding: true };
    const box: { records?: Map<string, AtRestFileRecord> } = {};
    const { access, records } = accessWith(async () => {
      if (sealer.holding) {
        sealer.holding = false;
        box.records?.set(ORIGINAL, sealedOriginal);
        return 'busy';
      }
      return { release: async () => undefined };
    });
    box.records = records;
    const prisma = { messageAttachment: { findUnique: async () => row('server') }, message: {} };
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: crypto.randomBytes(2000), attachmentId: ID, language: 'en', uploadRoot: root, access });
    expect(records.has(TRACK)).toBe(true);
  });

  it('conversation au repos et verrou injoignable : l’écriture échoue vite, rien en clair', async () => {
    const { access } = accessWith(async () => { throw new SealLockUnavailableError(); });
    const prisma = { messageAttachment: { findUnique: async () => row('server') }, message: {} };
    const started = Date.now();
    await expect(writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: crypto.randomBytes(2000), attachmentId: ID, language: 'en', uploadRoot: root, access })).rejects.toBeInstanceOf(SealLockUnavailableError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await fs.stat(path.join(root, TRACK)).then(() => true, () => false)).toBe(false);
  });

  it('conversation en clair : aucun verrou, la piste s’écrit tout de suite', async () => {
    const lock = jest.fn(async () => { throw new SealLockUnavailableError(); });
    const { access } = accessWith(lock as never);
    const prisma = { messageAttachment: { findUnique: async () => row(null) }, message: {} };
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: crypto.randomBytes(2000), attachmentId: ID, language: 'en', uploadRoot: root, access });
    expect(lock).not.toHaveBeenCalled();
    expect(await fs.stat(path.join(root, TRACK)).then(() => true, () => false)).toBe(true);
  });
});
