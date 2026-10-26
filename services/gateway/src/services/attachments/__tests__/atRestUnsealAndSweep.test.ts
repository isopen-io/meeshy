/**
 * #13100 — le retour arrière rouvre en place chaque fichier scellé, à
 * l'identique, et retire sa ligne ; à blanc, il ne touche rien. Le balayage
 * efface les pistes TTS temporaires laissées par un processus tué. Un message
 * à vue unique ou à flamme ne laisse rien au translator ; l'effacement d'un
 * message ou d'une pièce y demande l'oubli.
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
import { sweepStaleTrackTemporaries } from '../../../jobs/at-rest-file-sweep';
import { contentDisappears } from '../../messaging/sealMessageAttachments';
import { eraseSharedTranslations } from '../../messaging/sharedTranslationErasure';
import { configureTranslatorForget } from '../../translatorForget';

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
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'unseal-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('le retour arrière du scellement', () => {
  it('rouvre en place, à l’identique, et retire la ligne ; à blanc, rien ne change', async () => {
    const access = memoryAccess();
    const key = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.png';
    const plain = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(150_000)]);
    await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true });
    await fs.writeFile(path.join(root, '2026/10/u/source.png'), plain);
    await sealStoredFile({ uploadRoot: root, sourceKey: '2026/10/u/source.png', targetKey: key, binding: { conversationId: CONV, attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', role: 'original' }, access });
    const records = async () => [...access.records.values()];

    const dry = await unsealAllAtRestFiles({ uploadRoot: root, access, records }, { dryRun: true, log: () => undefined });
    expect(dry).toEqual({ sealed: 1, missing: 0, unsealed: 0, failed: 0 });
    expect((await fs.readFile(path.join(root, key))).equals(plain)).toBe(false);

    const applied = await unsealAllAtRestFiles({ uploadRoot: root, access, records }, { dryRun: false, log: () => undefined });
    expect(applied).toMatchObject({ unsealed: 1, failed: 0 });
    expect((await fs.readFile(path.join(root, key))).equals(plain)).toBe(true);
    expect(access.records.size).toBe(0);
  });

  it('un fichier qui ne s’ouvre pas reste tel quel, compté en échec', async () => {
    const access = memoryAccess();
    const key = '2026/10/u/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1b.png';
    await fs.mkdir(path.join(root, '2026/10/u'), { recursive: true });
    await fs.writeFile(path.join(root, '2026/10/u/s.png'), crypto.randomBytes(500));
    await sealStoredFile({ uploadRoot: root, sourceKey: '2026/10/u/s.png', targetKey: key, binding: { conversationId: CONV, attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', role: 'original' }, access });
    const sealedBytes = await fs.readFile(path.join(root, key));
    const wrong = { ...access, keyring: { ...access.keyring, fileOpeningKey: async () => crypto.randomBytes(32) } };
    const report = await unsealAllAtRestFiles({ uploadRoot: root, access: wrong, records: async () => [...access.records.values()] }, { dryRun: false, log: () => undefined });
    expect(report).toMatchObject({ unsealed: 0, failed: 1 });
    expect((await fs.readFile(path.join(root, key))).equals(sealedBytes)).toBe(true);
    expect(access.records.size).toBe(1);
  });
});

describe('le balayage', () => {
  it('efface une piste temporaire de plus d’une heure, garde une récente et les pistes', async () => {
    const dir = path.join(root, 'translated');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '.track-old'), 'clair');
    await fs.writeFile(path.join(dir, '.track-new'), 'clair');
    await fs.writeFile(path.join(dir, 'aaaaaaaaaaaaaaaaaaaaaaa1_en.m4a'), 'piste');
    const old = Date.now() / 1000 - 2 * 3600;
    await fs.utimes(path.join(dir, '.track-old'), old, old);
    expect(await sweepStaleTrackTemporaries(root, Date.now())).toBe(1);
    expect((await fs.readdir(dir)).sort()).toEqual(['.track-new', 'aaaaaaaaaaaaaaaaaaaaaaa1_en.m4a']);
  });
});

describe('le translator ne garde rien d’un contenu qui disparaît', () => {
  it('vue unique et flamme : la tâche audio part protégée ; un message ordinaire non', () => {
    expect(contentDisappears({ isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null })).toBe(true);
    expect(contentDisappears({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: 30, expiresAt: new Date() })).toBe(true);
    expect(contentDisappears({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null })).toBe(false);
  });

  it('effacer les traductions d’un message purgé demande son oubli au translator', async () => {
    const forgotten: unknown[] = [];
    configureTranslatorForget({ forget: async (ids) => { forgotten.push(ids); }, acknowledge: async () => undefined, replay: async () => 0 });
    try {
      await eraseSharedTranslations({ sharedTranslation: { deleteMany: async () => ({ count: 0 }) } } as never, { messageIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'] });
    } finally {
      configureTranslatorForget(null);
    }
    expect(forgotten).toEqual([{ messageIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'] }]);
  });
});
