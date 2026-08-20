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

  // ── I3 (task-1-fix-round-3) : le repli par session de confiance était ────
  // INATTEIGNABLE sur ce chemin — `if (authHeader) {…} else if (sessionToken)
  // {…}` étant EXCLUSIF, un `Authorization` expiré empêchait TOUJOURS de
  // regarder `X-Session-Token`, alors que le client web envoie les deux
  // délibérément (`createAuthHeaders`). Ces tests prouvent que le repli est
  // désormais possible — avec EXACTEMENT la politique de `middleware/auth.ts`
  // (`findTrustedSession`) — sans jamais rouvrir la fermeture du round 2
  // (signature invalide toujours refusée, même avec une session de confiance
  // en base).
  describe('JWT expiré + X-Session-Token — repli par session de confiance (task-1-fix-round-3, I3)', () => {
    const TRUSTED_RAW_SESSION_TOKEN = 'trusted-device-session-token';

    it('accepte un jeton expiré quand une session de confiance valide existe pour le même utilisateur (cas légitime)', async () => {
      const prisma = buildFakePrisma({
        trustedSession: { id: 'session-1' },
      });
      const expiredToken = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET, { expiresIn: -10 });

      const result = await runFullUpload({
        prisma,
        headers: {
          authorization: `Bearer ${expiredToken}`,
          'x-session-token': TRUSTED_RAW_SESSION_TOKEN,
        },
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.uploadedBy).toBe('user-registered-1');
      expect(createCall.data.isAnonymous).toBe(false);
      expect(prisma.userSession.findFirst).toHaveBeenCalledWith({
        where: {
          sessionToken: hashSessionToken(TRUSTED_RAW_SESSION_TOKEN),
          userId: 'user-registered-1',
          isValid: true,
          isTrusted: true,
          expiresAt: { gt: expect.any(Date) },
        },
      });
    });

    it('refuse un jeton expiré quand le X-Session-Token fourni ne correspond à aucune session de confiance', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({ trustedSession: null });
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      const expiredToken = jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET, { expiresIn: -10 });

      await expect(
        captured.onUploadCreate(
          {
            headers: headersFrom({
              authorization: `Bearer ${expiredToken}`,
              'x-session-token': 'untrusted-or-unknown-session-token',
            }),
          },
          { metadata: { filename: 'voice.webm', filetype: 'audio/webm' }, size: WEBM_HEADER.length }
        )
      ).rejects.toMatchObject({ status_code: 401 });

      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('refuse un jeton FORGÉ (signature invalide) même quand une session de confiance valide existe — le repli ne couvre QUE l\'expiration', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      // La session de confiance existerait bel et bien pour cet utilisateur —
      // la garde doit refuser AVANT même d'interroger cette table, puisque le
      // jeton n'a jamais eu de signature valide (donc jamais un simple
      // `TokenExpiredError`).
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

  // ── task-1-fix-round-4 : régression non couverte par le round 3. Le
  // scénario le plus délicat du repli de session de confiance (I3) n'était
  // nommé par AUCUN test : un jeton JWT AUTHENTIQUE (signature valide, donc
  // jamais forgé) mais EXPIRÉ, décodant vers le `userId` d'un AUTRE
  // utilisateur (la victime), présenté avec la PROPRE session de confiance
  // (valide) de l'appelant. Le relecteur a vérifié que l'attaque est
  // bloquée PAR CONSTRUCTION du schéma — `UserSession.sessionToken` est
  // `@unique` GLOBALEMENT (`packages/shared/prisma/schema.prisma`), donc une
  // ligne dont le `sessionToken` haché correspond au jeton de l'attaquant ne
  // peut appartenir qu'à UN SEUL `userId` (celui de l'attaquant) — la
  // combinaison `{ userId: victime, sessionToken: hash(jeton attaquant) }`
  // ne peut donc JAMAIS matcher. Rien ne documentait ni ne gardait cette
  // propriété : ce test la nomme, pour l'avenir, si quelqu'un relâchait un
  // jour cette contrainte d'unicité.
  //
  // Distinct des tests « jeton FORGÉ » ci-dessus/ci-dessous (I3, I1) : ceux-là
  // ont une signature INVALIDE — un mode d'échec différent, qui court-circuite
  // avant même d'atteindre `findTrustedSession` (`jwt.verify` échoue avant
  // `TokenExpiredError`). Ici la signature est AUTHENTIQUE, seulement expirée.
  describe('JWT authentique-mais-expiré d\'AUTRUI + session de confiance PROPRE — bloqué par l\'unicité de sessionToken (task-1-fix-round-4)', () => {
    const ATTACKER_RAW_SESSION_TOKEN = 'attacker-own-trusted-session-token';
    const ATTACKER_USER_ID = 'attacker-user-1';
    const VICTIM_USER_ID = 'victim-user-1';

    /**
     * Mock `userSession.findFirst` qui simule fidèlement une collection
     * `UserSession` réelle sous la contrainte `@unique` de `sessionToken` :
     * une seule ligne existe pour ce jeton (celle de l'attaquant, propriétaire
     * réel du jeton), et le filtre est un AND sur TOUTES les clés de `where`
     * — exactement le comportement Mongo/Prisma. Contrairement à
     * `overrides.trustedSession` (stub uniforme, ignore `where`), ce mock
     * distingue vraiment : la requête ne matche QUE si `userId` demandé ET
     * `sessionToken` demandé correspondent TOUS LES DEUX à la ligne stockée.
     * Si une future régression retirait `userId` du `where` produit par
     * `findTrustedSession`, ce mock cesserait de filtrer dessus et
     * matcherait par le seul `sessionToken` — faisant tomber le test négatif
     * ci-dessous.
     */
    function buildFaithfulUniqueSessionPrisma() {
      const storedRow = {
        id: 'session-attacker',
        userId: ATTACKER_USER_ID,
        sessionToken: hashSessionToken(ATTACKER_RAW_SESSION_TOKEN),
        isValid: true,
        isTrusted: true,
      };
      const prisma = buildFakePrisma();
      prisma.userSession.findFirst = jest.fn<any>().mockImplementation(({ where }: any) => {
        const matches = Object.entries(where).every(([key, expected]) => {
          if (key === 'expiresAt') return true; // fraîcheur, non simulée ici
          return (storedRow as Record<string, unknown>)[key] === expected;
        });
        return Promise.resolve(matches ? { id: storedRow.id } : null);
      });
      return prisma;
    }

    it("refuse le JWT authentique-mais-expiré de la VICTIME, même accompagné de la PROPRE session de confiance valide de l'attaquant", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFaithfulUniqueSessionPrisma();
      await registerTusRoutes(buildFakeFastify(prisma));
      if (!captured) throw new Error('onUploadCreate not captured');

      // Signature AUTHENTIQUE (même secret que le serveur) — pas un jeton
      // forgé — décodant vers l'identifiant de la VICTIME, simplement expiré.
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

      expect(prisma.userSession.findFirst).toHaveBeenCalledWith({
        where: {
          sessionToken: hashSessionToken(ATTACKER_RAW_SESSION_TOKEN),
          userId: VICTIM_USER_ID,
          isValid: true,
          isTrusted: true,
          expiresAt: { gt: expect.any(Date) },
        },
      });
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });

    it("contrôle positif : la MÊME session de confiance accepte quand elle accompagne le jeton expiré de SON PROPRE propriétaire (le mock discrimine vraiment, ce n'est pas un stub toujours-null)", async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFaithfulUniqueSessionPrisma();

      const result = await runFullUpload({
        prisma,
        headers: {
          authorization: `Bearer ${jwt.sign({ userId: ATTACKER_USER_ID }, JWT_SECRET, { expiresIn: -10 })}`,
          'x-session-token': ATTACKER_RAW_SESSION_TOKEN,
        },
        filename: 'voice.webm',
        filetype: 'audio/webm',
        bytes: WEBM_HEADER,
      });

      expect(result.status_code).toBe(200);
      const createCall = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0] as any;
      expect(createCall.data.uploadedBy).toBe(ATTACKER_USER_ID);
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

    it('autorise le propriétaire dont le JWT a expiré PENDANT une reprise, via sa session de confiance (parité I3)', async () => {
      const { registerTusRoutes } = await importFreshTusHandler(uploadDir);
      const prisma = buildFakePrisma({ trustedSession: { id: 'session-1' } });
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
            }),
          },
          'owned-upload'
        )
      ).resolves.toBeUndefined();
    });

    it("refuse un jeton FORGÉ même avec une session de confiance valide en base (le repli ne couvre que l'expiration, parité I3)", async () => {
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
