/**
 * #13100 — quatrième audit adversarial, témoin (rouge avant son correctif) : Redis configuré mais injoignable. Le verrou
 * fail-closed rend « occupé » au lieu de lever : `holdSealLock` attend alors ses
 * 40 × 250 ms avant CHAQUE piste TTS — y compris dans une conversation EN CLAIR,
 * puisque le verrou est désormais pris avant de juger le régime. Chaque piste
 * traduite arrive 10 s plus tard pendant toute la panne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { writeTranslatedTrack } from '../atRest/translatedTrackWrite';
import { gatewaySealLockOf } from '../atRest/sealLock';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'trackwait-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('piste TTS d’une conversation en clair pendant une panne Redis', () => {
  it('s’écrit sans attendre un verrou qui ne viendra pas', async () => {
    const down = { set: async () => { throw new Error('Connection is closed.'); }, eval: async () => { throw new Error('Connection is closed.'); } };
    const records = new Map<string, AtRestFileRecord>();
    const access: AtRestFileAccess = {
      store: { find: async (k) => records.get(k) ?? null, save: async (r) => { records.set(r.storageKey, r); }, remove: async (k) => { records.delete(k); }, ofAttachment: async () => [], replacingSince: async () => [] },
      keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: crypto.randomBytes(32) }), fileOpeningKey: async () => crypto.randomBytes(32) },
      lock: gatewaySealLockOf({ redis: () => down as never, configured: () => true, onUnavailable: () => undefined }),
    };
    const row = { id: ID, filePath: '2026/10/u/vocal_0f8fad5b-d9cb-469f-a165-70867728950e.m4a', isEncrypted: false, encryptionMode: null, message: { conversationId: 'd'.repeat(24), conversation: { encryptionMode: null, encryptionEnabledAt: null } } };
    const prisma = { messageAttachment: { findUnique: async () => row }, message: {} };
    const started = Date.now();
    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, `translated/${ID}_en.m4a`), bytes: crypto.randomBytes(1000), attachmentId: ID, language: 'en', uploadRoot: root, access });
    expect(Date.now() - started).toBeLessThan(2000);
  }, 20_000);
});
