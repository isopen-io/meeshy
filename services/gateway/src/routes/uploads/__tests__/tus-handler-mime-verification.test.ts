/**
 * `routes/uploads/tus-handler.ts` — la vérification GLOBALE de signature
 * ajoutée par #5615 (`verifyDeclaredMimeType`, appelée en tête de
 * `onUploadFinish`, avant même de savoir s'il s'agit d'un `PostMedia` ou d'un
 * `MessageAttachment`, et AVANT la branche `if (isAnonymous)`).
 *
 * Avant #5615, `ContentSignature.ts` ne sniffait que l'exemption anonyme
 * (`classifyAnonymousAttachment`, appelée `if (isAnonymous)` seulement) : un
 * compte ENREGISTRÉ pouvait déclarer n'importe quel mimeType sans qu'aucun
 * octet ne soit jamais regardé, et même pour un anonyme, un lien totalement
 * OUVERT laissait passer une déclaration mensongère sans aucun contrôle. Ces
 * deux angles morts sont ceux que ce fichier prouve fermés — séparé de
 * `tus-handler.test.ts` (qui garde ses témoins sur la classification anonyme
 * elle-même, round 2) pour ne pas faire grossir un fichier déjà dans la dette
 * héritée du cliquet de taille (#4531).
 *
 * Méthode de mock identique à `tus-handler.test.ts` / `tus-handler-
 * transcription.test.ts` : la plomberie du protocole TUS est mockée, les
 * vraies options (`onUploadCreate`/`onUploadFinish`) sont capturées et
 * invoquées directement avec un `prisma` factice et un VRAI répertoire
 * temporaire (le contenu réel du fichier doit être lisible sur disque,
 * `readFilePrefix` fait de l'I/O réelle).
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

const mockExtractMetadata = jest.fn<any>().mockResolvedValue({});
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

// ─── Fixtures : octets réels ────────────────────────────────────────────────

const PDF_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\nreste du document...\n', 'binary');
const SVG_BYTES = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
const VIDEO_BYTES = Buffer.from('contenu vidéo quelconque, aucune signature vérifiée pour cette famille');

const JWT_SECRET = 'test-secret-tus-mime-verification';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

function buildFakeFastify(prisma: any) {
  return { prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any;
}

function buildFakePrisma(overrides: { participant?: unknown; shareLink?: unknown } = {}) {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(overrides.participant ?? null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(overrides.shareLink ?? null) },
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
  return { authorization: `Bearer ${jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET)}` };
}

describe('tus-handler — vérification globale de signature (#5615)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    mockExtractMetadata.mockResolvedValue({});
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-mime-verification-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  /** Simule une upload TUS complète : create, écrit les octets, finish. */
  async function runFullUpload(params: {
    prisma: ReturnType<typeof buildFakePrisma>;
    headers: Record<string, string>;
    filename: string;
    filetype: string;
    bytes: Buffer;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('onUploadCreate/onUploadFinish not captured');

    const uploadId = 'upload-1';
    const created = await captured.onUploadCreate(
      { headers: headersFrom(params.headers) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.bytes.length }
    );

    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), params.bytes);

    try {
      return await captured.onUploadFinish(
        {},
        { id: uploadId, metadata: created.metadata, size: params.bytes.length, storage: undefined }
      );
    } catch (thrown) {
      return thrown as { status_code?: number; body?: string };
    }
  }

  // ── Angle mort n°1 : un compte ENREGISTRÉ ne passait par AUCUNE vérification ──

  it('refuse un PDF déclaré image/png pour un utilisateur ENREGISTRÉ', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({
      prisma,
      headers: registeredHeaders(),
      filename: 'photo.png',
      filetype: 'image/png', // déclaration mensongère — aucun lien de partage à contourner ici
      bytes: PDF_BYTES,
    });

    expect(result.status_code).toBe(400);
    expect(result.body).toContain('does not match any known image signature');
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });

  it('autorise un SVG légitime déclaré image/svg+xml pour un utilisateur enregistré', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({
      prisma,
      headers: registeredHeaders(),
      filename: 'icon.svg',
      filetype: 'image/svg+xml',
      bytes: SVG_BYTES,
    });

    expect(result.status_code).toBe(200);
    expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
  });

  it('refuse un PDF déclaré image/svg+xml pour un utilisateur enregistré (couverture SVG)', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({
      prisma,
      headers: registeredHeaders(),
      filename: 'fake.svg',
      filetype: 'image/svg+xml',
      bytes: PDF_BYTES,
    });

    expect(result.status_code).toBe(400);
    expect(result.body).toContain('does not match SVG content');
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });

  it("n'exige aucune signature pour une famille sans vérification connue (vidéo, texte…) — décision produit", async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({
      prisma,
      headers: registeredHeaders(),
      filename: 'clip.mp4',
      filetype: 'video/mp4',
      bytes: VIDEO_BYTES,
    });

    expect(result.status_code).toBe(200);
    expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
  });

  // ── Angle mort n°2 : un lien anonyme totalement OUVERT laissait passer ────
  // une déclaration mensongère, faute de vérification en amont de la
  // permission (`allowAnonymousFiles`/`Images` tous deux vrais ⇒ tout seau
  // était autorisé, y compris celui d'une reclassification silencieuse).

  it('refuse un fichier déclaré image/png sur un lien anonyme totalement OUVERT — la signature prime sur les permissions', async () => {
    const prisma = buildFakePrisma({
      participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
      shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
    });

    const result = await runFullUpload({
      prisma,
      headers: { 'x-session-token': 'anon-session-token-xyz' },
      filename: 'document.pdf',
      filetype: 'image/png', // déclaration mensongère, lien pourtant totalement ouvert
      bytes: PDF_BYTES,
    });

    expect(result.status_code).toBe(400);
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });
});
