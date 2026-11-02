/**
 * #13100 — la clé de données d'une conversation chiffre ses TEXTES en
 * AES-GCM ; ses FICHIERS ne la prennent jamais telle quelle : ils la
 * dérivent sous une étiquette propre (HKDF-SHA256, RFC 5869), puis Tink
 * Streaming dérive encore par fichier. Deux usages, deux clés.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';
import { associatedDataOf, FILE_KEY_INFO, fileMainKeyOf, sealStoredFile, type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';
import { openSealedRange } from '../atRest/sealedFileFormat';

const DATA_KEY = crypto.randomBytes(32);
const KEY = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.png';

function access(): AtRestFileAccess & { records: Map<string, AtRestFileRecord> } {
  const records = new Map<string, AtRestFileRecord>();
  return {
    records,
    store: { find: async (k) => records.get(k) ?? null, save: async (r) => { records.set(r.storageKey, r); }, remove: async () => undefined, ofAttachment: async () => [], replacingSince: async () => [] },
    keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: DATA_KEY }), fileOpeningKey: async () => DATA_KEY },
  };
}

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'filekey-')); await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true }); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('la clé des fichiers', () => {
  it('est HKDF-SHA256(clé de données, sel vide, étiquette de fichier) — jamais la clé de données elle-même', () => {
    expect(FILE_KEY_INFO).toBe('meeshy:at-rest-file-key:v1');
    const expected = Buffer.from(crypto.hkdfSync('sha256', DATA_KEY, Buffer.alloc(0), FILE_KEY_INFO, 32));
    expect(fileMainKeyOf(DATA_KEY).equals(expected)).toBe(true);
    expect(fileMainKeyOf(DATA_KEY).equals(DATA_KEY)).toBe(false);
  });

  it('un fichier scellé s’ouvre par la clé dérivée, et pas par la clé de données brute', async () => {
    const plain = crypto.randomBytes(3000);
    await fs.writeFile(path.join(root, '2026/10/u/source.png'), plain);
    const a = access();
    const record = await sealStoredFile({ uploadRoot: root, sourceKey: '2026/10/u/source.png', targetKey: KEY, binding: { conversationId: 'd'.repeat(24), attachmentId: 'a'.repeat(24), role: 'original' }, access: a });
    const sealed = await fs.readFile(path.join(root, KEY));
    const open = async (mainKey: Buffer) => {
      const parts: Buffer[] = [];
      for await (const part of openSealedRange({ mainKey, associatedData: associatedDataOf(record), ciphertextSegmentSize: record.segmentSize, plaintextSize: record.plaintextSize, readCiphertext: async (start, end) => sealed.subarray(start, end) })) parts.push(part);
      return Buffer.concat(parts);
    };
    expect((await open(fileMainKeyOf(DATA_KEY))).equals(plain)).toBe(true);
    await expect(open(DATA_KEY)).rejects.toThrow();
  });
});
