/**
 * #13100 — le verrou de scellement de la passerelle est FAIL-CLOSED : Redis
 * configuré mais injoignable LÈVE `SealLockUnavailableError`, que le
 * scellement tient pour « occupé » (le balayage reprendra la pièce),
 * jamais un verrou local qu'une autre instance ne verrait pas. Le verrou du
 * processus ne sert que sans Redis configuré du tout (un seul processus).
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

import { gatewaySealLockOf, SealLockUnavailableError } from '../atRest/sealLock';
import { sealAttachmentFiles } from '../atRest/sealAttachmentFiles';
import type { AtRestFileAccess, AtRestFileRecord } from '../atRest/atRestFiles';

const down = {
  set: async () => { throw new Error('Connection is closed.'); },
  eval: async () => { throw new Error('Connection is closed.'); },
};

const KEY = '2026/10/u/passeport_0f8fad5b.jpg';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'lock-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('le verrou de scellement de la passerelle', () => {
  it('Redis configuré mais injoignable : occupé, signalé — et aucun scellement ne démarre', async () => {
    const signalled: unknown[] = [];
    const lock = gatewaySealLockOf({ redis: () => down as never, configured: () => true, onUnavailable: (error) => signalled.push(error) });
    await expect(lock(KEY)).rejects.toBeInstanceOf(SealLockUnavailableError);
    expect(signalled).toHaveLength(1);

    await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true });
    await fs.writeFile(path.join(root, KEY), 'SECRET');
    const records = new Map<string, AtRestFileRecord>();
    const access: AtRestFileAccess = {
      store: { find: async (k) => records.get(k) ?? null, save: async (r) => { records.set(r.storageKey, r); }, remove: async () => undefined, ofAttachment: async () => [], replacingSince: async () => [] },
      keyring: { fileSealingKey: async () => ({ keyId: 'k1', key: crypto.randomBytes(32) }), fileOpeningKey: async () => crypto.randomBytes(32) },
      lock,
    };
    const prisma = { messageAttachment: { findUnique: async () => ({ filePath: KEY }), findMany: async () => [], updateMany: async () => ({ count: 0 }) }, message: {} };
    expect(await sealAttachmentFiles({ prisma: prisma as never, uploadRoot: root, access }, { attachmentId: 'a'.repeat(24), conversationId: 'd'.repeat(24) })).toEqual({ status: 'skipped', reason: 'busy' });
    expect(records.size).toBe(0);
    expect(await fs.readFile(path.join(root, KEY), 'utf8')).toBe('SECRET');
  });

  it('Redis configuré mais sans client (connexion abandonnée) : occupé aussi', async () => {
    const lock = gatewaySealLockOf({ redis: () => null, configured: () => true, onUnavailable: () => undefined });
    await expect(lock(KEY)).rejects.toBeInstanceOf(SealLockUnavailableError);
  });

  it('sans Redis configuré (un seul processus) : le verrou du processus, exclusif et relâchable', async () => {
    const lock = gatewaySealLockOf({ redis: () => null, configured: () => false, onUnavailable: () => undefined });
    const held = await lock(KEY);
    expect(held).not.toBe('busy');
    expect(await lock(KEY)).toBe('busy');
    await (held as { release: () => Promise<void> }).release();
    expect(await lock(KEY)).not.toBe('busy');
  });
});
