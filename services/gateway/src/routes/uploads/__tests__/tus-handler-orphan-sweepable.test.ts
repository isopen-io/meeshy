/**
 * `routes/uploads/tus-handler.ts` — **la pièce jointe d'un téléversement
 * REPRENABLE doit être BALAYABLE** (#19801).
 *
 * `MaintenanceService.cleanupOrphanedAttachments` ramasse les pièces jointes
 * « pas liées à un message et vieilles de plus de 24 h » en lisant
 * `{ messageId: null }`. Sous MongoDB cette clause est une **ÉGALITÉ** : elle
 * exige la clé PRÉSENTE et nulle, et n'apparie jamais un document où la clé
 * est ABSENTE (`utils/prisma-unset.ts`).
 *
 * La branche MESSAGE de ce handler ne posait pas la clé. **Aucune pièce jointe
 * venue d'un téléversement reprenable n'était donc balayable** : un média
 * poussé puis jamais envoyé restait en base et ses octets sur le disque, pour
 * toujours, sans qu'aucune erreur ne remonte — le balayage journalise qu'il n'a
 * rien trouvé à nettoyer.
 *
 * ## La preuve tient dans la branche JUMELLE du même `if/else`
 *
 * Le même `if/else` crée un `PostMedia` pour un contexte de publication — 87
 * lignes plus haut dans la même fonction — et il pose `postId: null`
 * EXPLICITEMENT, parce que `sweepPendingPostMedia` lit cette clé pour trouver
 * les médias abandonnés. La discipline d'écriture était
 * donc déjà la réponse du dépôt, appliquée par la branche voisine du même
 * `else`. C'est ce que le troisième témoin épingle : **les deux branches posent
 * leur clé d'attente, ou aucune ne la pose.**
 *
 * ## Pourquoi l'ÉCRITURE, et pas la lecture
 *
 * `unsetOrNull('messageId')` au site de lecture rendrait le balayage exact pour
 * les lignes DÉJÀ en base — et armerait du même coup une suppression de masse
 * sur une population que personne n'a mesurée (directive porteur du
 * 2026-10-03 : une purge de données de production attend le feu vert). Écrire
 * la colonne rend exactes les lignes À VENIR sans rien supprimer de l'arriéré ;
 * les deux moitiés ne se substituent pas l'une à l'autre, et le sort de
 * l'arriéré est une décision séparée (#19801).
 *
 * Et pour les lignes à venir, ce lot n'invente aucune politique : les deux
 * autres créateurs de pièces en attente — `UploadProcessor` (`messageId:
 * messageId || null`) et la branche `PostMedia` ci-dessus — sont déjà soumis au
 * même seuil de 24 h. Celui-ci s'y aligne.
 *
 * Méthode de mock reprise de `tus-handler-transcription.test.ts` : la
 * plomberie du protocole est mockée, les vraies options du serveur
 * (`onUploadCreate` / `onUploadFinish`) sont capturées et invoquées.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';
import { MaintenanceService } from '../../../services/MaintenanceService';
import type { AttachmentService } from '../../../services/attachments';

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

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: jest.fn().mockResolvedValue({ duration: 1500 }),
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

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const JWT_SECRET = 'test-secret-tus-orphan-sweepable';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'ascii'),
]);

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
      findFirst: jest.fn<any>().mockResolvedValue(liveSession()),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

function registeredHeaders() {
  return { authorization: `Bearer ${jwt.sign({ userId: '5f00000000000000000000a0', sid: LIVE_SID }, JWT_SECRET)}` };
}

describe('tus-handler — une pièce jointe de téléversement reprenable est BALAYABLE (#19801)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-orphan-sweep-test-'));
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
    /** `post` | `story` | `status` | `comment` ⇒ branche PostMedia ; absent ⇒ branche MESSAGE. */
    uploadContext?: string;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('options TUS non capturées');

    const uploadId = 'upload-orphan-sweepable';
    const metadata: Record<string, string> = { filename: 'photo.png', filetype: 'image/png' };
    if (params.uploadContext !== undefined) metadata.uploadcontext = params.uploadContext;

    const created = await captured.onUploadCreate(
      { headers: headersFrom(registeredHeaders()) },
      { metadata, size: PNG_BYTES.length }
    );

    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), PNG_BYTES);

    try {
      return await captured.onUploadFinish(
        {},
        { id: uploadId, metadata: created.metadata, size: PNG_BYTES.length, storage: undefined }
      );
    } catch (thrown) {
      return thrown as { status_code?: number; body?: string };
    }
  }

  const createdAttachmentData = (prisma: ReturnType<typeof buildFakePrisma>): MongoDocument =>
    (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data as MongoDocument;

  /**
   * La clé est POSÉE, et `toHaveProperty` est l'assertion qui le dit : sur une
   * valeur `null`, `data.messageId === null` passe aussi bien pour une clé
   * absente que pour une clé nulle — exactement la confusion que ce lot répare.
   */
  it('pose la colonne `messageId` à `null` — la clé, pas seulement la valeur', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma });

    expect(result.status_code).toBe(200);
    expect(createdAttachmentData(prisma)).toHaveProperty('messageId', null);
  });

  /**
   * LE TÉMOIN QUI COMPOSE LES DEUX UNITÉS, et la seule forme qui pouvait voir
   * ce défaut (leçon du cycle 182 : « une règle qui s'exprime en deux unités
   * demande un témoin qui les COMPOSE »).
   *
   * La ligne est celle que le handler CRÉE ; la clause est celle que le
   * balayage ENVOIE — relevée sur l'appel réel, jamais recopiée. Un témoin qui
   * comparerait la clause à sa propre copie passerait au vert avec une clause
   * fausse ; un témoin qui fabriquerait la ligne avec `messageId: null`
   * explicite ne pourrait pas tomber.
   */
  it('la ligne créée est APPARIÉE par la clause que le balayage des orphelines envoie', async () => {
    const prisma = buildFakePrisma();
    await runFullUpload({ prisma });
    const row = { ...createdAttachmentData(prisma), createdAt: new Date('2026-01-01T00:00:00Z') };

    let sweepWhere: MongoDocument | undefined;
    const sweepPrisma = {
      messageAttachment: {
        findMany: jest.fn(async (args: { where: MongoDocument }) => {
          sweepWhere = args.where;
          return matchesMongoWhere(row, args.where) ? [{ ...row, id: 'a1', fileSize: 10, fileUrl: '/f' }] : [];
        }),
      },
      user: { findFirst: jest.fn(async () => null) },
      conversation: { findFirst: jest.fn(async () => null) },
      community: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaClient;
    const attachmentService = { deleteAttachment: jest.fn(async () => undefined) } as unknown as AttachmentService;
    const service = new MaintenanceService(sweepPrisma, attachmentService);

    await (service as unknown as { cleanupOrphanedAttachments: () => Promise<void> })
      .cleanupOrphanedAttachments.bind(service)();

    expect(sweepWhere).toBeDefined();
    expect(matchesMongoWhere(row, sweepWhere)).toBe(true);
    expect(attachmentService.deleteAttachment).toHaveBeenCalledTimes(1);
  });

  /**
   * LA PARITÉ DES DEUX BRANCHES DU MÊME `else`. La branche `PostMedia` posait
   * déjà `postId: null` pour son propre balayage ; c'est l'écart entre les deux
   * branches — pas une règle absente du dépôt — qui a tenu ce défaut en vie.
   */
  it('les DEUX branches du handler posent leur clé d’attente', async () => {
    const message = buildFakePrisma();
    await runFullUpload({ prisma: message });

    const publication = buildFakePrisma();
    await runFullUpload({ prisma: publication, uploadContext: 'post' });

    expect(createdAttachmentData(message)).toHaveProperty('messageId', null);
    expect((publication.postMedia.create as jest.Mock<any>).mock.calls[0][0].data).toHaveProperty('postId', null);
  });
});
