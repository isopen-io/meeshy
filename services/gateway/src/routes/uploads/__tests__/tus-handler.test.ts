/**
 * Tests de `routes/uploads/tus-handler.ts` — `onUploadCreate`/`onUploadFinish`.
 *
 * Contexte (task-1-fix-round-2, Critical 1) : ce chemin d'upload resumable
 * créait des `MessageAttachment` pour des participants anonymes SANS JAMAIS
 * consulter `allowAnonymousFiles`/`allowAnonymousImages` du lien de partage
 * — ni par déclaration, ni par octets. `routes/attachments/upload.ts` (REST)
 * avait déjà cette garde (round 1) ; ce second chemin la court-circuitait
 * entièrement. Ces tests prouvent le contournement AVEC DE VRAIS OCTETS
 * (un vrai PDF déclaré `audio/webm`), pas une chaîne de texte quelconque.
 *
 * Méthode de mock, reprise de `__tests__/security/route-auth-coverage.test.ts` :
 * `@tus/server`/`@tus/file-store` sont publiés en ESM pur, non transformables
 * par Jest (cf. commentaire de ce fichier). On mocke la PLOMBERIE du
 * protocole TUS (chunked upload resumable, hors périmètre de ce test) tout
 * en CAPTURANT les vraies options (`onUploadCreate`/`onUploadFinish`) passées
 * par `registerTusRoutes` — c'est exactement là que vit la garde qu'on veut
 * vérifier — pour les invoquer directement avec un `prisma` factice et un
 * VRAI répertoire temporaire (le contenu réel du fichier doit être lisible
 * sur disque, `readFilePrefix` fait de l'I/O réelle).
 *
 * `UPLOAD_PATH` est lu par `tus-handler.ts` au CHARGEMENT du module — repris
 * du patron de `routes/posts/__tests__/staticMuted.test.ts` : on pose
 * `process.env.UPLOAD_PATH` puis on importe dynamiquement le module après
 * `jest.resetModules()`, pour qu'il prenne le répertoire temporaire du test.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { hashSessionToken } from '../../../utils/session-token';

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
    handle() {
      // Plomberie du protocole TUS (chunked resumable) — hors périmètre.
    }
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
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

const WEBM_HEADER = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.from([0x42, 0x82, 0x84]),
  Buffer.from('webm', 'ascii'),
]); // vocal WebM authentique (DocType "webm")
const PDF_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\nreste du document...\n', 'binary');

const JWT_SECRET = 'test-secret-tus-handler';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

// ─── Fastify factice minimal (uniquement `.prisma`, seule dépendance lue) ──

function buildFakeFastify(prisma: any) {
  return {
    prisma,
    addContentTypeParser: jest.fn(),
    route: jest.fn(),
  } as any;
}

function buildFakePrisma(overrides: {
  participant?: unknown;
  shareLink?: unknown;
  createAttachment?: jest.Mock<any>;
} = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(overrides.participant ?? null),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(overrides.shareLink ?? null),
    },
    messageAttachment: {
      create: overrides.createAttachment ?? jest.fn<any>().mockResolvedValue({ id: 'created-attachment' }),
    },
    postMedia: {
      create: jest.fn<any>().mockResolvedValue({ id: 'created-post-media' }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

async function importFreshTusHandler(uploadPath: string) {
  process.env.UPLOAD_PATH = uploadPath;
  jest.resetModules();
  return import('../tus-handler');
}

describe('registerTusRoutes — onUploadCreate / onUploadFinish', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    mockExtractMetadata.mockResolvedValue({});
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-handler-test-'));
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
    uploadId?: string;
  }) {
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('onUploadCreate/onUploadFinish not captured');

    const uploadId = params.uploadId ?? 'upload-1';
    const created = await captured.onUploadCreate(
      { headers: headersFrom(params.headers) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.bytes.length }
    );

    // Écrit les octets réels au chemin que `onUploadFinish` s'attend à
    // trouver (`TUS_TEMP_PATH/<uploadId>`, résolu depuis `UPLOAD_PATH`).
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), params.bytes);

    // `onUploadFinish` REND `{status_code:200,...}` en cas de succès mais
    // LÈVE `{status_code,body}` en cas de refus (même contrat que la garde
    // PostMedia préexistante, ligne `throw { status_code: 403, ... }`) — le
    // vrai `@tus/server` traite les deux formes identiquement côté client
    // (cf. sa doc : "If an error is thrown... status_code and body are sent
    // to the client"). On normalise ici pour que les tests n'aient pas à
    // connaître cette distinction.
    try {
      return await captured.onUploadFinish(
        {},
        { id: uploadId, metadata: created.metadata, size: params.bytes.length, storage: undefined }
      );
    } catch (thrown) {
      return thrown as { status_code?: number; body?: string };
    }
  }

  // ── Critical 1 : contournement d'autorisation anonyme ────────────────────

  describe('anonyme — allowAnonymousFiles/allowAnonymousImages désormais consultés', () => {
    const RAW_SESSION_TOKEN = 'anon-session-token-xyz';
    const ANONYMOUS_HEADERS = { 'x-session-token': RAW_SESSION_TOKEN };

    it('refuse un PDF déclaré audio/webm quand le lien interdit fichiers ET images (contournement fermé)', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-locked' } },
        shareLink: { allowAnonymousFiles: false, allowAnonymousImages: false },
      });

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'document.pdf',
        filetype: 'audio/webm', // déclaration mensongère — l'exploit documenté
        bytes: PDF_BYTES,
      });

      expect(result.status_code).toBe(403);
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('nettoie le fichier temporaire déjà écrit quand la classification refuse', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-locked' } },
        shareLink: { allowAnonymousFiles: false, allowAnonymousImages: false },
      });

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'document.pdf',
        filetype: 'audio/webm',
        bytes: PDF_BYTES,
        uploadId: 'upload-cleanup',
      });

      const year = new Date().getFullYear().toString();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      const destDir = path.join(uploadDir, year, month, 'participant-1');
      const remaining = await fs.readdir(destDir).catch(() => []);
      expect(remaining).toHaveLength(0);
    });

    it('accepte un vrai vocal WebM même quand le lien interdit fichiers ET images', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-locked' } },
        shareLink: { allowAnonymousFiles: false, allowAnonymousImages: false },
      });

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    });

    it('autorise un document quand le lien autorise explicitement les fichiers', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
        shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
      });

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'document.pdf',
        filetype: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(result.status_code).toBe(200);
      expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    });

    it('résout l\'identité par sessionTokenHash — jamais le jeton brut comme userId (fermeture du 2e volet du contournement)', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
        shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
      });

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'document.pdf',
        filetype: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(prisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          sessionTokenHash: hashSessionToken(RAW_SESSION_TOKEN),
          type: 'anonymous',
          isActive: true,
        },
        select: { id: true, anonymousSession: true },
      });
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.uploadedBy).toBe('participant-1');
      expect(createCall.data.uploadedBy).not.toBe(RAW_SESSION_TOKEN);
    });

    it('refuse un jeton de session qui ne correspond à aucun participant actif (jeton forgé/expiré)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({ participant: null });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      await expect(
        captured.onUploadCreate(
          { headers: headersFrom({ 'x-session-token': 'forged-or-expired-token' }) },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });
    });

    it('refuse quand le participant existe mais son lien de partage a disparu', async () => {
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'deleted-link' } },
        shareLink: null,
      });

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'document.pdf',
        filetype: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(result.status_code).toBe(403);
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });
  });

  describe('authentifié (JWT) — pas de garde de lien de partage (non concerné par ce round)', () => {
    it('autorise un utilisateur enregistré sans jamais consulter le lien de partage', async () => {
      const prisma = buildFakePrisma();
      const token = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET);

      const result = await runFullUpload({
        prisma,
        headers: { authorization: `Bearer ${token}` },
        filename: 'document.pdf',
        filetype: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(result.status_code).toBe(200);
      expect(prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.uploadedBy).toBe('user-registered-1');
      expect(createCall.data.isAnonymous).toBe(false);
    });
  });

  describe('sans credential — inchangé', () => {
    it('refuse une requête sans Authorization ni X-Session-Token', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      await registerTusRoutes(buildFakeFastify(buildFakePrisma()));
      if (!captured) throw new Error('onUploadCreate not captured');

      await expect(
        captured.onUploadCreate({ headers: headersFrom({}) }, { metadata: {}, size: 0 })
      ).rejects.toMatchObject({ status_code: 401 });
    });
  });
});
