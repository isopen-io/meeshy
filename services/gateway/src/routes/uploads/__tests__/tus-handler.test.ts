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
  onIncomingRequest: (req: any, uploadId: string) => Promise<void>;
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

/**
 * Registre en mémoire des uploads « existants » côté magasin — nécessaire
 * pour tester `onIncomingRequest` (task-1-fix-round-3, I1) : ce hook
 * interroge `uploadDataStore.getUpload(uploadId)` pour retrouver le
 * propriétaire déjà figé dans les métadonnées. `getUpload` sur le VRAI
 * `FileStore` lève quand l'id est inconnu (`ERRORS.FILE_NOT_FOUND`) — reproduit
 * ici par un rejet, pour que le hook prenne le même chemin « rien à protéger »
 * qu'en production sur un upload pas encore créé (POST).
 */
const mockFileStoreRecords = new Map<string, { metadata?: Record<string, string> }>();

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
    async create(file: any) {
      mockFileStoreRecords.set(file.id, { metadata: file.metadata });
      return file;
    }
    async getUpload(id: string) {
      // Sentinelle pour task-1-fix-round-4 : reproduit une erreur de magasin
      // qui n'est NI `ERRORS.FILE_NOT_FOUND` (404) NI `ERRORS.FILE_NO_LONGER_
      // EXISTS` (410) — les deux SEULS codes que le vrai `FileStore.getUpload`
      // (`@tus/file-store`, `dist/index.js`) documente pour une absence
      // réelle d'upload. Toute autre erreur (E/S, permission, magasin de
      // config indisponible…) ne prouve AUCUNE absence.
      if (id === 'storage-error-upload-id') {
        throw { status_code: 500, body: 'Something went wrong with that request\n' };
      }
      const record = mockFileStoreRecords.get(id);
      if (!record) {
        throw { status_code: 404, body: 'Not found\n' };
      }
      return { id, metadata: record.metadata, offset: 0, size: undefined, storage: undefined };
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

const WEBM_HEADER = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.from([0x42, 0x82, 0x84]),
  Buffer.from('webm', 'ascii'),
]); // vocal WebM authentique (DocType "webm")
const PDF_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\nreste du document...\n', 'binary');

const JWT_SECRET = 'test-secret-tus-handler';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

// TUS est le protocole des gros téléversements resumable — le cas d'usage
// principal des apps natives — d'où le choix de NATIVE_USER_AGENT comme
// fixture par défaut ci-dessous. task-1-fix-round-5 avait ajouté ces
// fixtures pour discriminer web vs native ; cette règle a été RETIRÉE au
// round 6 (décision produit clarifiée : être connecté depuis plusieurs
// applications à la fois est légitime). Conservées comme en-têtes de
// requête neutres — elles n'ont plus aucun effet sur l'issue des tests.
const NATIVE_USER_AGENT = 'Meeshy/1 CFNetwork/1408.0.4 Darwin/22.5.0';
const WEB_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
  trustedSession?: unknown;
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
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(overrides.trustedSession ?? null),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

/** Seed direct du magasin factice — un upload « déjà créé », comme après un POST réussi. */
function seedExistingUpload(uploadId: string, metadata: Record<string, string>) {
  mockFileStoreRecords.set(uploadId, { metadata });
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
    mockFileStoreRecords.clear();
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
    /// Métadonnées TUS SUPPLÉMENTAIRES (en-tête `Upload-Metadata`), au-delà de
    /// `filename`/`filetype` que tout envoi porte. Ce sont des CHAÎNES : c'est
    /// la forme réelle du canal, et c'est ce qui distingue ce chemin du JSON
    /// que reçoit `UploadProcessor`.
    extraMetadata?: Record<string, string>;
  }) {
    const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('onUploadCreate/onUploadFinish not captured');

    const uploadId = params.uploadId ?? 'upload-1';
    const created = await captured.onUploadCreate(
      { headers: headersFrom(params.headers) },
      {
        metadata: { filename: params.filename, filetype: params.filetype, ...(params.extraMetadata ?? {}) },
        size: params.bytes.length,
      }
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

  // ── Provenance : le TROISIÈME site de création d'attachement ─────────────

  describe('capturedInApp — la provenance déclarée survit AUSSI par TUS', () => {
    const RAW_SESSION_TOKEN = 'anon-session-token-xyz';
    const ANONYMOUS_HEADERS = { 'x-session-token': RAW_SESSION_TOKEN };

    const openLinkPrisma = () => buildFakePrisma({
      participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
      shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
    });

    it('persiste la provenance quand le client la DÉCLARE', async () => {
      // Ce gestionnaire écrit `MessageAttachment` LUI-MÊME, sans passer par
      // `UploadProcessor` : c'est le troisième site de création du dépôt, et
      // celui qu'emprunte iOS. Un champ posé sur les deux autres et oublié ici
      // est perdu pour le client qui en a le plus besoin — celui qui possède
      // une caméra.
      const prisma = openLinkPrisma();

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
        extraMetadata: { capturedinapp: 'true' },
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.capturedInApp).toBe(true);
    });

    it("n'affirme une capture que sur la chaîne EXACTE « true »", async () => {
      // Les métadonnées TUS sont des chaînes, et `'false'` est véridique en
      // JavaScript : une lecture laxiste déclarerait capture ce qui n'en est pas
      // une, donc poserait une confirmation sans fondement. La lecture est
      // stricte, comme sur le chemin JSON.
      const prisma = openLinkPrisma();

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
        extraMetadata: { capturedinapp: 'false' },
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.capturedInApp).toBe(false);
    });

    it("traite l'absence de déclaration comme « pas une capture »", async () => {
      // Tout client qui ignore ce champ, et tout fichier choisi dans une
      // galerie. L'absence ne peut pas valoir capture.
      const prisma = openLinkPrisma();

      const result = await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.capturedInApp).toBe(false);
    });
  });

  // ── Ce que la RÉPONSE promet, et ce qu'elle portait ──────────────────────

  describe('corps de réponse — les champs que `UploadedAttachmentResponse` déclare REQUIS', () => {
    const RAW_SESSION_TOKEN = 'anon-session-token-xyz';

    it('porte uploadedBy / isAnonymous / createdAt — le type les déclare requis, le corps ne les portait pas', async () => {
      // Ce chemin ne servait jusqu'ici que les fichiers > 50 Mo ; le transport
      // de publication en fait le chemin UNIQUE de tout média de post/story.
      // Un client qui fait confiance au type lisait `undefined` sur quatre
      // champs. Trois d'entre eux sont CONNUS ici — les poser coûte trois
      // lignes ; seul `messageId` n'existe pas pour un média de publication.
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
        shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
      });

      const result = await runFullUpload({
        prisma,
        headers: { 'x-session-token': RAW_SESSION_TOKEN },
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      const attachment = JSON.parse(result.body as string).data.attachment;
      expect(attachment.isAnonymous).toBe(true);
      expect(typeof attachment.uploadedBy).toBe('string');
      expect(typeof attachment.createdAt).toBe('string');
      expect(Number.isNaN(Date.parse(attachment.createdAt))).toBe(false);
    });
  });

  // ── La durée MESURÉE par le client, seul à pouvoir la connaître ─────────

  describe('duration — la mesure du client sert de repli quand le fichier ne la porte pas', () => {
    const RAW_SESSION_TOKEN = 'anon-session-token-xyz';
    const ANONYMOUS_HEADERS = { 'x-session-token': RAW_SESSION_TOKEN };

    const openLinkPrisma = () => buildFakePrisma({
      participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sharelink-open' } },
      shareLink: { allowAnonymousFiles: true, allowAnonymousImages: true },
    });

    /** `providedMetadata` — le 4e argument d'`extractMetadata`. */
    const providedMetadataArg = () => (mockExtractMetadata.mock.calls[0] as any[])[3];

    it("passe la durée déclarée à l'extracteur, en MILLISECONDES", async () => {
      // `MetadataManager` porte exactement la branche qu'il faut — « Backend
      // extraction failed, using frontend as fallback » — et elle n'existe QUE
      // si `providedMetadata` est fourni. Le handler TUS passait `undefined`,
      // donc elle était inatteignable : un WebM de `MediaRecorder`, dont
      // l'en-tête ne porte pas de durée, ressortait à 0 ms.
      const prisma = openLinkPrisma();

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
        extraMetadata: { duration: '12340' },
      });

      expect(providedMetadataArg()).toEqual({ duration: 12340 });
    });

    it("n'invente AUCUNE durée quand le client n'en déclare pas", async () => {
      const prisma = openLinkPrisma();

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(providedMetadataArg()).toBeUndefined();
    });

    it('ignore une durée non numérique — les métadonnées TUS sont des CHAÎNES', async () => {
      const prisma = openLinkPrisma();

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
        extraMetadata: { duration: 'pas-un-nombre' },
      });

      // Un `Number('pas-un-nombre')` vaut `NaN`, qui traverse `>= 0` sans
      // rougir et s'écrirait tel quel en base.
      expect(providedMetadataArg()).toBeUndefined();
    });

    it('ignore une durée nulle ou négative — un repli ne remplace rien par rien', async () => {
      const prisma = openLinkPrisma();

      await runFullUpload({
        prisma,
        headers: ANONYMOUS_HEADERS,
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
        extraMetadata: { duration: '0' },
      });

      expect(providedMetadataArg()).toBeUndefined();
    });
  });

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

  // ── Contournement d'authentification : repli `jwt.decode` non vérifié ────
  //
  // AVANT : quand `jwt.verify` échouait (signature invalide, jeton forgé,
  // jeton expiré), le code retombait sur `jwt.decode`, qui NE VÉRIFIE AUCUNE
  // SIGNATURE — il suffisait de fabriquer un jeton `{ userId: "<victime>" }`
  // signé avec n'importe quel secret pour usurper l'identité de n'importe
  // quel compte enregistré sur cette route de création de pièces jointes.
  describe('JWT invalide ou expiré — refusé, jamais décodé sans vérification', () => {
    it('refuse un jeton forgé avec un mauvais secret portant un userId arbitraire (usurpation d\'identité fermée)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      // Signé avec un secret QUELCONQUE, différent de `JWT_SECRET` du serveur
      // — exactement le jeton qu'un attaquant peut fabriquer lui-même.
      const forgedToken = jwt.sign({ userId: 'victim-user-1' }, 'attacker-controlled-secret');

      await expect(
        captured.onUploadCreate(
          { headers: headersFrom({ authorization: `Bearer ${forgedToken}` }) },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('refuse un jeton expiré quand aucun X-Session-Token n\'accompagne la requête (pas de repli possible)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const expiredToken = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onUploadCreate(
          { headers: headersFrom({ authorization: `Bearer ${expiredToken}` }) },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('accepte toujours un jeton légitimement signé par le serveur (non-régression)', async () => {
      const prisma = buildFakePrisma();
      const legitToken = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET);

      const result = await runFullUpload({
        prisma,
        headers: { authorization: `Bearer ${legitToken}` },
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.uploadedBy).toBe('user-registered-1');
    });
  });

  // ── task-1-fix-round-6 : le repli par session de confiance qu'avaient ────
  // construit les rounds 3/4/5 (I3) a été RETIRÉ. Décision du propriétaire
  // après clarification : « une forme de connexion à la fois » — un jeton
  // d'authentification et un jeton de session ne se substituent plus l'un à
  // l'autre nulle part sur ce chemin, y compris pour une simple expiration.
  // Conséquence explicitement acceptée : un téléversement long dont le JWT
  // expire en cours de route échoue désormais, là où il était rattrapé
  // jusqu'ici. Ces tests prouvent que le rattrapage a bien DISPARU — pas
  // seulement qu'il échoue pour une autre raison — en vérifiant que la table
  // des sessions n'est même plus interrogée.
  describe('JWT expiré + X-Session-Token — plus aucun repli, quelle que soit la session (task-1-fix-round-6)', () => {
    const TRUSTED_RAW_SESSION_TOKEN = 'trusted-device-session-token';

    it('refuse un jeton expiré même quand une session de confiance PARFAITEMENT valide existe pour le même utilisateur', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({
        trustedSession: { id: 'session-1', userAgent: NATIVE_USER_AGENT, browserName: null },
      });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const expiredToken = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onUploadCreate(
          {
            headers: headersFrom({
              authorization: `Bearer ${expiredToken}`,
              'x-session-token': TRUSTED_RAW_SESSION_TOKEN,
              'user-agent': NATIVE_USER_AGENT,
            }),
          },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      // Preuve que ce n'est pas une coïncidence : le rattrapage n'est même
      // plus TENTÉ, pas seulement refusé pour une autre raison.
      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('refuse un jeton FORGÉ (signature invalide) même quand une session de confiance valide existe — aucun repli ne subsiste sur ce chemin', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({ trustedSession: { id: 'session-1' } });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const forgedToken = jwt.sign({ userId: 'victim-user-1' }, 'attacker-controlled-secret');

      await expect(
        captured.onUploadCreate(
          {
            headers: headersFrom({
              authorization: `Bearer ${forgedToken}`,
              'x-session-token': TRUSTED_RAW_SESSION_TOKEN,
            }),
          },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });
  });

  // ── task-1-fix-round-4 avait nommé, puis round 6 rend structurellement ────
  // impossible, le scénario le plus délicat du repli de session de
  // confiance : un jeton JWT AUTHENTIQUE mais EXPIRÉ, décodant vers le
  // `userId` d'un AUTRE utilisateur (la victime), présenté avec la PROPRE
  // session de confiance (valide) de l'appelant. Round 4 documentait que
  // l'attaque était bloquée par l'unicité globale de `UserSession.
  // sessionToken` (`packages/shared/prisma/schema.prisma`) — round 6 retire
  // le mécanisme de repli lui-même, donc `userSession.findFirst` n'est même
  // plus appelé : la défense en profondeur (unicité du jeton) reste vraie
  // mais n'est plus ce qui protège ici.
  //
  // Distinct des tests « jeton FORGÉ » ci-dessus/ci-dessous (I1) : ceux-là
  // ont une signature INVALIDE — un mode d'échec différent. Ici la signature
  // est AUTHENTIQUE, seulement expirée — et pourtant refusée aussi (round 6),
  // y compris pour le PROPRE jeton du propriétaire de la session : c'est la
  // conséquence acceptée par le propriétaire (un long téléversement dont le
  // JWT expire en cours de route échoue désormais).
  describe("JWT authentique-mais-expiré + session de confiance PROPRE — refusé quel que soit le userId (task-1-fix-round-6)", () => {
    const ATTACKER_RAW_SESSION_TOKEN = 'attacker-own-trusted-session-token';
    const ATTACKER_USER_ID = 'attacker-user-1';
    const VICTIM_USER_ID = 'victim-user-1';

    function buildFaithfulUniqueSessionPrisma() {
      const storedRow = {
        id: 'session-attacker',
        userId: ATTACKER_USER_ID,
        sessionToken: hashSessionToken(ATTACKER_RAW_SESSION_TOKEN),
        isValid: true,
        isTrusted: true,
        userAgent: NATIVE_USER_AGENT,
        browserName: null,
      };
      const prisma = buildFakePrisma();
      prisma.userSession.findFirst = jest.fn<any>().mockImplementation(({ where }: any) => {
        const matches = Object.entries(where).every(([key, expected]) => {
          if (key === 'expiresAt') return true; // fraîcheur, non simulée ici
          return (storedRow as Record<string, unknown>)[key] === expected;
        });
        return Promise.resolve(matches ? storedRow : null);
      });
      return prisma;
    }

    it("refuse le JWT authentique-mais-expiré de la VICTIME, même accompagné de la PROPRE session de confiance valide de l'attaquant", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFaithfulUniqueSessionPrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const victimAuthenticExpiredToken = jwt.sign({ userId: VICTIM_USER_ID }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onUploadCreate(
          {
            headers: headersFrom({
              authorization: `Bearer ${victimAuthenticExpiredToken}`,
              'x-session-token': ATTACKER_RAW_SESSION_TOKEN,
            }),
          },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it("refuse aussi le PROPRE jeton expiré du propriétaire de la session — conséquence acceptée du round 6 (avant : contrôle positif du round 4)", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFaithfulUniqueSessionPrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const ownExpiredToken = jwt.sign({ userId: ATTACKER_USER_ID }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onUploadCreate(
          {
            headers: headersFrom({
              authorization: `Bearer ${ownExpiredToken}`,
              'x-session-token': ATTACKER_RAW_SESSION_TOKEN,
              'user-agent': NATIVE_USER_AGENT,
            }),
          },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
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

  // ── I1 (task-1-fix-round-3) : reprendre/inspecter/supprimer un upload ne
  // demandait aucun justificatif — `onIncomingRequest` (seul point d'accroche
  // appelé par GET/HEAD/PATCH/DELETE, jamais `onUploadCreate`) n'était pas
  // configuré. En connaissant seulement l'`uploadId` (128 bits aléatoires),
  // un tiers pouvait poursuivre/inspecter/terminer le téléversement d'autrui.
  describe('onIncomingRequest — justificatif exigé pour GET/HEAD/PATCH/DELETE (task-1-fix-round-3, I1)', () => {
    it('laisse passer un uploadId inconnu (upload pas encore créé — cas du POST)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      await registerTusRoutes(buildFakeFastify(buildFakePrisma()));
      if (!captured) throw new Error('onIncomingRequest not captured');

      await expect(
        captured.onIncomingRequest({ headers: headersFrom({}) }, 'never-created-upload-id')
      ).resolves.toBeUndefined();
    });

    it('laisse passer un upload existant sans métadonnée userId (legacy, rien à comparer)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      await registerTusRoutes(buildFakeFastify(buildFakePrisma()));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('legacy-upload', { filename: 'x.pdf' });

      await expect(
        captured.onIncomingRequest({ headers: headersFrom({}) }, 'legacy-upload')
      ).resolves.toBeUndefined();
    });

    // task-1-fix-round-4 — AVANT : ce `catch` traitait TOUTE erreur de
    // `getUpload` (pas seulement 404/410, les deux SEULS codes qui signifient
    // une absence réelle) comme « rien à protéger, laisser passer » — une
    // panne du magasin (E/S, permission…) ouvrait donc l'accès PAR DÉFAUT à
    // un upload qui existe bel et bien, faute d'avoir pu lire ses métadonnées.
    it("NE masque PAS une erreur de magasin qui ne signifie pas une absence — la propage, ne laisse jamais passer par défaut", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      await registerTusRoutes(buildFakeFastify(buildFakePrisma()));
      if (!captured) throw new Error('onIncomingRequest not captured');

      await expect(
        captured.onIncomingRequest({ headers: headersFrom({}) }, 'storage-error-upload-id')
      ).rejects.toMatchObject({ status_code: 500 });
    });

    it('refuse un PATCH/HEAD/DELETE sans aucun credential sur un upload existant', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      await registerTusRoutes(buildFakeFastify(buildFakePrisma()));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload', { userId: 'owner-1', isAnonymous: 'false' });

      await expect(
        captured.onIncomingRequest({ headers: headersFrom({}) }, 'owned-upload')
      ).rejects.toMatchObject({ status_code: 401 });
    });

    it("refuse quand l'appelant authentifié n'est PAS le propriétaire (contournement fermé)", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload', { userId: 'owner-1', isAnonymous: 'false' });

      const attackerToken = jwt.sign({ userId: 'attacker-2' }, JWT_SECRET);

      await expect(
        captured.onIncomingRequest(
          { headers: headersFrom({ authorization: `Bearer ${attackerToken}` }) },
          'owned-upload'
        )
      ).rejects.toMatchObject({ status_code: 403 });
    });

    it('autorise le PROPRIÉTAIRE (utilisateur enregistré) à poursuivre/inspecter/supprimer son propre upload', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload', { userId: 'owner-1', isAnonymous: 'false' });

      const ownerToken = jwt.sign({ userId: 'owner-1' }, JWT_SECRET);

      await expect(
        captured.onIncomingRequest(
          { headers: headersFrom({ authorization: `Bearer ${ownerToken}` }) },
          'owned-upload'
        )
      ).resolves.toBeUndefined();
    });

    it('autorise le PROPRIÉTAIRE anonyme (participantId) via son X-Session-Token', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({
        participant: { id: 'participant-1', anonymousSession: { shareLinkId: 'sl-1' } },
      });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload-anon', { userId: 'participant-1', isAnonymous: 'true' });

      await expect(
        captured.onIncomingRequest(
          { headers: headersFrom({ 'x-session-token': 'anon-owner-session-token' }) },
          'owned-upload-anon'
        )
      ).resolves.toBeUndefined();
    });

    it("refuse un AUTRE participant anonyme que le propriétaire", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({
        participant: { id: 'participant-intruder', anonymousSession: { shareLinkId: 'sl-1' } },
      });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload-anon', { userId: 'participant-1', isAnonymous: 'true' });

      await expect(
        captured.onIncomingRequest(
          { headers: headersFrom({ 'x-session-token': 'intruder-session-token' }) },
          'owned-upload-anon'
        )
      ).rejects.toMatchObject({ status_code: 403 });
    });

    // task-1-fix-round-6 — AVANT (parité I3, rounds 3 à 5) : le propriétaire
    // dont le JWT expirait PENDANT une reprise (PATCH/HEAD/DELETE) était
    // rattrapé par sa session de confiance. Ce repli a disparu : conséquence
    // explicitement acceptée par le propriétaire, une reprise dont le JWT a
    // expiré échoue désormais elle aussi, même avec une session de confiance
    // parfaitement valide pour le même utilisateur.
    it('refuse le propriétaire dont le JWT a expiré PENDANT une reprise, même via sa propre session de confiance valide', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({
        trustedSession: { id: 'session-1', userAgent: NATIVE_USER_AGENT, browserName: null },
      });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload', { userId: 'owner-1', isAnonymous: 'false' });

      const expiredOwnerToken = jwt.sign({ userId: 'owner-1' }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onIncomingRequest(
          {
            headers: headersFrom({
              authorization: `Bearer ${expiredOwnerToken}`,
              'x-session-token': 'trusted-device-session-token',
              'user-agent': NATIVE_USER_AGENT,
            }),
          },
          'owned-upload'
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
    });

    it("refuse un jeton FORGÉ même avec une session de confiance valide en base — aucun repli ne subsiste, ni pour la signature ni pour l'expiration (round 6, parité I1)", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({ trustedSession: { id: 'session-1' } });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onIncomingRequest not captured');
      seedExistingUpload('owned-upload', { userId: 'owner-1', isAnonymous: 'false' });

      const forgedToken = jwt.sign({ userId: 'owner-1' }, 'attacker-controlled-secret');

      await expect(
        captured.onIncomingRequest(
          {
            headers: headersFrom({
              authorization: `Bearer ${forgedToken}`,
              'x-session-token': 'trusted-device-session-token',
            }),
          },
          'owned-upload'
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
    });
  });
});
