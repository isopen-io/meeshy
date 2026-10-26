/**
 * #13100 — l'effacement d'un clair remplacé n'est MARQUÉ terminé que si le
 * disque ET la copie du seau sont effacés : un seau en échec (ou muet) laisse
 * la pièce dans la file, et le passage suivant réessaie.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { finishPendingErasuresPass } from '../../../jobs/at-rest-file-sweep';
import { eraseMirroredCopy } from '../../storage/objects/mirroredErasure';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';
import { ciphertextSizeFor } from '../atRest/sealedFileFormat';

const ID = 'a'.repeat(24);
const SEALED = '2026/10/u/0123456789abcdef0123456789abcdef.jpg';
const CLEAR = '2026/10/u/passeport.jpg';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-')); await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true }); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('l’effacement du clair remplacé et sa copie du seau', () => {
  it('le seau échoue : la pièce n’est pas marquée, et le passage suivant réessaie puis la marque', async () => {
    const record: AtRestFileRecord = { storageKey: SEALED, conversationId: 'd'.repeat(24), attachmentId: ID, keyId: 'k1', role: 'original', plaintextSize: 0, format: 'x', segmentSize: 65536, replacedKey: CLEAR };
    await fs.writeFile(path.join(root, SEALED), Buffer.alloc(ciphertextSizeFor(0, 65536)));
    await fs.writeFile(path.join(root, CLEAR), 'CLAIR');
    const marked: string[] = [];
    const access: AtRestFileAccess = {
      store: {
        find: async () => record, save: async () => undefined, remove: async () => undefined,
        ofAttachment: async () => [record],
        replacingSince: async () => (marked.includes(ID) ? [] : [ID]),
        markReplacedErased: async (id) => { marked.push(id); },
      },
      keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: Buffer.alloc(32) }), fileOpeningKey: async () => Buffer.alloc(32) },
    };
    const prisma = { messageAttachment: { findMany: async ({ where }: { where: { filePath: string } }) => (where.filePath === SEALED ? [{ id: ID, filePath: SEALED }] : []), updateMany: async () => ({ count: 0 }), findUnique: async () => null }, message: {} };
    const attempts: string[] = [];
    const mirror = { remove: async (key: string) => { attempts.push(key); if (attempts.length === 1) throw new Error('seau indisponible'); } };
    const deps = { prisma: prisma as never, uploadRoot: root, access, eraseMirrored: (absolute: string) => eraseMirroredCopy(absolute, root, mirror) };

    await finishPendingErasuresPass(deps, new Date(0));
    expect(marked).toEqual([]);
    await finishPendingErasuresPass(deps, new Date(0));
    expect(attempts).toEqual([CLEAR, CLEAR]);
    expect(marked).toEqual([ID]);
  });

  it('un seau muet au-delà du délai vaut un échec', async () => {
    const hung = { remove: () => new Promise<void>(() => undefined) };
    expect(await eraseMirroredCopy(path.join(root, CLEAR), root, hung, { timeoutMs: 20 })).toBe(false);
    expect(await eraseMirroredCopy(path.join(root, CLEAR), root, null)).toBe(true);
  });
});
