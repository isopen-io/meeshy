/**
 * #13100 — une adresse signée livrée AVANT le scellement d'une pièce (cache
 * client, synchro différée) reste lisible après l'effacement du clair : la
 * route sert le scellé qui l'a remplacée. Un fichier présent se sert lui-même.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { currentStorageKey } from '../../../routes/attachments/storedBytes';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';

const OLD = '2026/10/u/photo_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
const NEW = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.jpg';

const record = (over: Partial<AtRestFileRecord> = {}): AtRestFileRecord => ({
  storageKey: NEW, conversationId: 'd'.repeat(24), attachmentId: 'a'.repeat(24), keyId: 'k1', role: 'original',
  plaintextSize: 1, format: 'x', segmentSize: 65536, replacedKey: OLD, ...over,
});

function access(records: readonly AtRestFileRecord[]): AtRestFileAccess {
  return {
    store: {
      find: async (k) => records.find((r) => r.storageKey === k) ?? null,
      save: async () => undefined,
      remove: async () => undefined,
      ofAttachment: async () => [],
      replacingSince: async () => [],
      byReplacedKey: async (k, role) => records.find((r) => r.replacedKey === k && (!role || r.role === role)) ?? null,
    },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: Buffer.alloc(32) }), fileOpeningKey: async () => Buffer.alloc(32) },
  };
}

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'replaced-')); await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true }); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('la clé servie pour une adresse signée', () => {
  it('un clair effacé par son scellement se sert par le scellé qui l’a remplacé', async () => {
    expect(await currentStorageKey(OLD, { uploadRoot: root, atRest: access([record()]) })).toBe(NEW);
  });

  it('une vignette remplacée aussi', async () => {
    const thumb = '2026/10/u/photo_thumb.webp';
    const sealedThumb = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a_thumb.webp';
    expect(await currentStorageKey(thumb, { uploadRoot: root, atRest: access([record({ storageKey: sealedThumb, role: 'thumbnail', replacedKey: thumb })]) })).toBe(sealedThumb);
  });

  it('un fichier encore présent se sert lui-même ; une clé inconnue reste la clé demandée', async () => {
    await fs.writeFile(path.join(root, OLD), 'x');
    expect(await currentStorageKey(OLD, { uploadRoot: root, atRest: access([record()]) })).toBe(OLD);
    expect(await currentStorageKey('2026/10/u/inconnu.jpg', { uploadRoot: root, atRest: access([record()]) })).toBe('2026/10/u/inconnu.jpg');
  });
});
