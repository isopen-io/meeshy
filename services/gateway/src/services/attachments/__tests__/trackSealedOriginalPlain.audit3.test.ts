/**
 * #13100 — troisième audit adversarial, témoin (rouge avant son correctif) : une piste TTS d'une pièce dont l'ORIGINAL n'est
 * pas (encore) scellé — verrou occupé ou Redis en panne à l'envoi, pièce d'avant
 * l'activation, clé hors forme — est scellée EN PLACE. Son adresse
 * `translated/<id>_<langue>` n'a pas la forme opaque : `carriesSealedFile` ne la
 * voit pas, l'adresse servie n'est PAS signée, et la route nue la refuse (scellée).
 * La piste n'est lisible par personne.
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
import { type AtRestFileAccess, type AtRestFileRecord } from '../atRest/atRestFiles';
import { signReaderAttachmentUrls } from '../signedAttachmentUrls';
import { readerFileUrlSignerFromEnv } from '../readerFileSignature';
import { atRestSealingOf } from '../../../routes/attachments/storedBytes';

const CONV = 'dddddddddddddddddddddd01';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const READER = 'cccccccccccccccccccccc01';
const ORIGINAL = '2026/10/68f2a81417a557e8ce4ddfc1/vocal_0f8fad5b-d9cb-469f-a165-70867728950e.m4a';
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
const previousKey = process.env.ATTACHMENT_URL_SIGNING_KEY;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'track-'));
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 5).toString('base64');
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (previousKey === undefined) delete process.env.ATTACHMENT_URL_SIGNING_KEY; else process.env.ATTACHMENT_URL_SIGNING_KEY = previousKey;
});

describe('piste TTS d’une pièce dont l’original est resté en clair', () => {
  it('la piste servie au lecteur est lisible : signée, ou servie par l’adresse nue', async () => {
    const access = memoryAccess();
    const row = { id: ID, filePath: ORIGINAL, isEncrypted: false, encryptionMode: null, message: { conversationId: CONV, conversation: { encryptionMode: 'server', encryptionEnabledAt: new Date() } } };
    const prisma = { messageAttachment: { findUnique: async () => row }, message: {} };
    await fs.mkdir(path.join(root, '2026/10/68f2a81417a557e8ce4ddfc1'), { recursive: true });
    await fs.writeFile(path.join(root, ORIGINAL), crypto.randomBytes(4000));

    await writeTranslatedTrack(prisma as never, { absolutePath: path.join(root, TRACK), bytes: crypto.randomBytes(3000), attachmentId: ID, language: 'en', uploadRoot: root, access });

    const served = signReaderAttachmentUrls(
      { id: ID, fileUrl: `/api/v1/attachments/file/${ORIGINAL}`, thumbnailUrl: null, isViewOnce: false, isBlurred: false, effectFlags: 0, translations: { en: { url: `/api/v1/attachments/file/${TRACK}` } } },
      { message: { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null } as never, readerParticipantId: READER, signer: readerFileUrlSignerFromEnv(new Date()) }
    );
    const trackUrl = (served.translations as Record<string, { url: string }>).en.url;
    const signed = trackUrl.includes('/attachments/signed/');
    const bareRefused = (await atRestSealingOf(path.join(root, TRACK), { uploadRoot: root, atRest: access })).kind === 'sealed';
    expect({ signed, bareRefused, readable: signed || !bareRefused }).toEqual({ signed, bareRefused, readable: true });
  });
});
