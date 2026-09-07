/**
 * `routes/uploads/tus-handler.ts` — la transcription faite SUR L'APPAREIL
 * voyage avec la création TUS (#4948, D-AUDIO-01).
 *
 * `MessageProcessor.processAudioAttachments` lit déjà
 * `MessageAttachment.metadata.transcription` et le remet au translator en
 * passthrough (`mobileTranscription`) — mais AUCUN chemin d'upload iOS ne
 * l'écrivait : la plomberie attendait un repli que personne n'alimentait. Ce
 * handler range désormais la clé `transcription` d'`Upload-Metadata` (JSON,
 * base64-décodé par `@tus/server`) dans la ligne créée, `source: 'mobile'`.
 *
 * Trois lois, une par bloc :
 *  - une charge valide est PERSISTÉE, marquée `mobile` ;
 *  - l'absence ne change RIEN à la ligne (aucune clé `metadata`) ;
 *  - une charge invalide (JSON cassé, forme inconnue, trop lourde, hors
 *    audio) est IGNORÉE sans faire échouer l'upload — l'audio arrive, le
 *    serveur transcrit comme avant.
 *
 * Méthode de mock reprise de `routes/uploads/__tests__/tus-handler.test.ts` :
 * la plomberie du protocole est mockée, les vraies options du serveur
 * (`onUploadCreate`/`onUploadFinish`) sont capturées et invoquées.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

type CapturedTusOptions = {
  onUploadCreate: (req: any, upload: any) => Promise<{ metadata?: Record<string, string> }>;
  onUploadFinish: (req: any, upload: any) => Promise<{ status_code?: number; headers?: any; body?: string }>;
};

let captured: CapturedTusOptions | null = null;

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(opts: any) {
      captured = opts;
    }
    handle() {}
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
    async getUpload() {
      throw { status_code: 404, body: 'Not found\n' };
    }
  },
}));

const mockExtractMetadata = jest.fn<any>().mockResolvedValue({ duration: 1500 });
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: (...a: any[]) => mockExtractMetadata(...a),
    generateThumbnail: jest.fn().mockResolvedValue(null),
    generateVideoThumbnail: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-transcription';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
// #3627 — un vrai en-tête MP4/M4A (ftyp box) : `onUploadFinish` vérifie
// désormais la signature réelle contre le `filetype` déclaré pour tout
// appelant REGISTERED (ce que ces tests exercent), donc un contenu arbitraire
// ne suffit plus à faire passer un upload déclaré `audio/mp4`.
const AUDIO_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypM4A ', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('M4A mp42isom', 'ascii'),
]);
// PNG minimal (signature 8 octets + chunk IHDR de longueur 13) — pour le test
// qui déclare `image/png` : un contenu AUDIO échouerait désormais la même
// vérification de signature, pour une raison hors du périmètre de ce test.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'ascii'),
]);

const VALID_TRANSCRIPTION = {
  text: 'Bonjour à tous',
  language: 'fr',
  confidence: 0.92,
  durationMs: 1500,
  segments: [
    { text: 'Bonjour', startMs: 100, endMs: 500 },
    { text: 'à tous', startMs: 600, endMs: 1100 },
  ],
};

function buildFakeFastify(prisma: any) {
  return { prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any;
}

function buildFakePrisma() {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    messageAttachment: { create: jest.fn<any>().mockResolvedValue({ id: 'created-attachment' }) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'created-post-media' }) },
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

function registeredHeaders() {
  return { authorization: `Bearer ${jwt.sign({ userId: 'user-registered' }, JWT_SECRET)}` };
}

describe('tus-handler — transcription faite sur l’appareil', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-transcription-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  async function runFullUpload(params: {
    prisma: ReturnType<typeof buildFakePrisma>;
    filetype?: string;
    filename?: string;
    /** Valeur DÉCODÉE de la clé `transcription` (`@tus/server` défait le base64). */
    transcription?: string;
    /** Octets réellement écrits sur disque — défaut : un en-tête M4A valide. */
    content?: Buffer;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('options TUS non capturées');

    const content = params.content ?? AUDIO_BYTES;
    const uploadId = 'upload-transcription';
    const metadata: Record<string, string> = {
      filename: params.filename ?? 'voice.m4a',
      filetype: params.filetype ?? 'audio/mp4',
    };
    if (params.transcription !== undefined) metadata.transcription = params.transcription;

    const created = await captured.onUploadCreate(
      { headers: headersFrom(registeredHeaders()) },
      { metadata, size: content.length }
    );

    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), content);

    try {
      return await captured.onUploadFinish(
        {},
        { id: uploadId, metadata: created.metadata, size: content.length, storage: undefined }
      );
    } catch (thrown) {
      return thrown as { status_code?: number; body?: string };
    }
  }

  function createdData(prisma: ReturnType<typeof buildFakePrisma>) {
    return (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data as any;
  }

  // ── Une charge valide est persistée ────────────────────────────────────

  it('range la transcription dans metadata.transcription, marquée source mobile', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, transcription: JSON.stringify(VALID_TRANSCRIPTION) });

    expect(result.status_code).toBe(200);
    expect(createdData(prisma).metadata).toEqual({
      transcription: { ...VALID_TRANSCRIPTION, source: 'mobile' },
    });
  });

  it('accepte une charge minimale (texte + langue) et ne fabrique aucun champ', async () => {
    const prisma = buildFakePrisma();

    await runFullUpload({ prisma, transcription: JSON.stringify({ text: 'Salut', language: 'en-US' }) });

    expect(createdData(prisma).metadata).toEqual({
      transcription: { text: 'Salut', language: 'en-US', source: 'mobile' },
    });
  });

  it('ne laisse pas le client choisir la source ni glisser des clés inconnues', async () => {
    // `source` dit d'où vient le texte — c'est le serveur qui le sait, pas
    // le client ; et `metadata` est un document Mongo : rien d'arbitraire n'y entre.
    const prisma = buildFakePrisma();

    await runFullUpload({
      prisma,
      transcription: JSON.stringify({ ...VALID_TRANSCRIPTION, source: 'whisper', model: 'large-v3', extra: { deep: true } }),
    });

    const persisted = createdData(prisma).metadata.transcription;
    expect(persisted.source).toBe('mobile');
    expect(persisted).not.toHaveProperty('model');
    expect(persisted).not.toHaveProperty('extra');
  });

  // ── L'absence ne change rien ───────────────────────────────────────────

  it("sans clé transcription, la ligne créée n'a aucune metadata", async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma });

    expect(result.status_code).toBe(200);
    expect(createdData(prisma)).not.toHaveProperty('metadata');
  });

  // ── Une charge invalide est ignorée sans faire échouer l'upload ─────────

  it.each([
    ['JSON cassé', '{"text": "Bonjour", "language": '],
    ['texte manquant', JSON.stringify({ language: 'fr' })],
    ['texte vide', JSON.stringify({ text: '   ', language: 'fr' })],
    ['langue hors ISO', JSON.stringify({ text: 'Bonjour', language: 'français' })],
    ['confiance hors [0,1]', JSON.stringify({ text: 'Bonjour', language: 'fr', confidence: 7 })],
    ['segment sans horodatage', JSON.stringify({ text: 'Bonjour', language: 'fr', segments: [{ text: 'Bonjour' }] })],
    ['tableau à la place de l’objet', JSON.stringify([VALID_TRANSCRIPTION])],
  ])('ignore une charge invalide (%s) et laisse l’upload réussir', async (_label, payload) => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, transcription: payload });

    expect(result.status_code).toBe(200);
    expect(createdData(prisma)).not.toHaveProperty('metadata');
  });

  it('ignore une charge trop lourde (au-delà de 16 Kio)', async () => {
    const prisma = buildFakePrisma();
    const heavy = JSON.stringify({ text: 'a'.repeat(16 * 1024 + 1), language: 'fr' });

    const result = await runFullUpload({ prisma, transcription: heavy });

    expect(result.status_code).toBe(200);
    expect(createdData(prisma)).not.toHaveProperty('metadata');
  });

  it("n'attache une transcription qu'à un AUDIO", async () => {
    // `MessageProcessor` ne la lit que sur les audios ; sur une image elle
    // ne serait qu'un blob mort dans la ligne.
    const prisma = buildFakePrisma();

    const result = await runFullUpload({
      prisma,
      filename: 'photo.png',
      filetype: 'image/png',
      content: PNG_BYTES,
      transcription: JSON.stringify(VALID_TRANSCRIPTION),
    });

    expect(result.status_code).toBe(200);
    expect(createdData(prisma)).not.toHaveProperty('metadata');
  });
});
