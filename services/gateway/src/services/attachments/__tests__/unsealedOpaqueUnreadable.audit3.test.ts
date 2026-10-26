/**
 * #13100 — troisième audit adversarial, témoin (rouge avant son correctif) : étape 2 du retour arrière (migration unseal) jouée,
 * passerelle NOUVELLE encore en service (`AT_REST_FILE_SEALING=off`, étape 1). Les fichiers
 * rouverts gardent leur nom opaque et n'ont plus de ligne : `openedAtRest` les tient pour
 * « scellés sans ligne » et ne les sert par AUCUNE route (ni signée, ni par identifiant).
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

import { sealStoredFile, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';
import { unsealAllAtRestFiles } from '../atRest/atRestUnseal';
import { locateStoredBytes } from '../../../routes/attachments/storedBytes';

const CONV = 'dddddddddddddddddddddd01';
const KEY = crypto.randomBytes(32);

function memoryAccess(): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: {
      find: async (k) => records.get(k) ?? null,
      save: async (r) => { records.set(r.storageKey, r); },
      remove: async (k) => { records.delete(k); },
      ofAttachment: async (id) => [...records.values()].filter((r) => r.attachmentId === id),
      replacingSince: async () => [],
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: KEY }), fileOpeningKey: async () => KEY },
  };
}

let root: string;
const previous = process.env.AT_REST_FILE_SEALING;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'unsealed-')); process.env.AT_REST_FILE_SEALING = 'off'; });
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.AT_REST_FILE_SEALING; else process.env.AT_REST_FILE_SEALING = previous;
});

describe('retour arrière : fichier rouvert, passerelle nouvelle encore en service', () => {
  it('le fichier rouvert se lit encore par la route signée', async () => {
    const access = memoryAccess();
    const key = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.png';
    await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true });
    await fs.writeFile(path.join(root, '2026/10/u/source.png'), crypto.randomBytes(5000));
    await sealStoredFile({ uploadRoot: root, sourceKey: '2026/10/u/source.png', targetKey: key, binding: { conversationId: CONV, attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', role: 'original' }, access });
    await unsealAllAtRestFiles({ uploadRoot: root, access, records: async () => [...access.records.values()] }, { dryRun: false, log: () => undefined });
    expect(access.records.size).toBe(0);

    const located = await locateStoredBytes(path.join(root, key), { uploadRoot: root, atRest: access });
    expect(located).not.toBeNull();
  });
});
