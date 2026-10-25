/**
 * `routes/uploads/tus-handler.ts` — un blob chiffré de bout en bout (#10789).
 *
 * L'appareil chiffre la pièce et ne téléverse que le chiffré, sous le contexte
 * `e2ee-attachment`. La passerelle le range comme un blob OPAQUE : aucun
 * reniflage de type, aucun retrait EXIF, aucune métadonnée extraite, aucune
 * vignette, aucune normalisation, aucune tâche différée. Le condensat déclaré
 * est vérifié. Et rien de ce que le chiffré cache — nom, type, durée,
 * transcription, ThumbHash — n'est admis à côté, refusé avant le premier octet.
 *
 * Modèle de menace : serveur compromis en lecture (disque, base). Méthode de
 * mock reprise de `tus-handler-transcription.test.ts`.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import { encryptAttachment } from '@meeshy/shared/utils/e2ee-attachment-cipher';

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

const mockExtractMetadata = jest.fn<any>().mockResolvedValue({ width: 10, height: 10 });
const mockProbe = jest.fn<any>().mockResolvedValue(null);
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: (...a: any[]) => mockExtractMetadata(...a),
    probeMediaStreams: (...a: any[]) => mockProbe(...a),
    generateThumbnail: jest.fn().mockResolvedValue(null),
    generateVideoThumbnail: jest.fn().mockResolvedValue(null),
  })),
}));

const mockStrip = jest.fn<any>().mockResolvedValue(null);
jest.mock('../../../services/attachments/media-metadata-strip', () => ({
  stripStoredMediaMetadata: (...a: any[]) => mockStrip(...a),
}));

const mockRenditions = jest.fn<any>();
jest.mock('../../../services/attachments/media-renditions', () => ({
  produceMediaRenditions: (...a: any[]) => mockRenditions(...a),
  imageVariantsJson: (v: unknown) => v,
  renditionsJson: (v: unknown) => v,
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-e2ee-blob';
const USER_ID = '5f00000000000000000000e2';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

/** Un JPEG avec un EXIF : en clair, la passerelle le renifle et le dépouille. Chiffré, elle n'y voit rien. */
const JPEG_WITH_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16]),
  Buffer.from('Exif\0\0GPS-48.8566N-2.3522E', 'ascii'),
  randomBytes(600),
]);

function buildFakePrisma() {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    messageAttachment: { create: jest.fn<any>().mockResolvedValue({ id: '6add0000000000000000b10b' }) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'post-media' }) },
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(liveSession()),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

const headersFrom = (map: Record<string, string>) => ({ get: (key: string) => map[key.toLowerCase()] });
const registered = () => headersFrom({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` });
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('base64');

const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : Promise.resolve([path.join(dir, entry.name)]))),
  );
  return nested.flat();
};

describe('tus-handler — blob chiffré de bout en bout (#10789)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    [mockExtractMetadata, mockProbe, mockStrip, mockRenditions].forEach((mock) => mock.mockClear());
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-e2ee-blob-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.UPLOAD_PATH = uploadDir;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  async function server(prisma = buildFakePrisma()) {
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');
    return { tus: captured, prisma };
  }

  const blobMetadata = (digest: string, extra: Record<string, string> = {}) => ({
    uploadcontext: 'e2ee-attachment',
    digest,
    filetype: 'application/octet-stream',
    filename: 'blob',
    ...extra,
  });

  async function upload(params: { blob: Uint8Array; metadata: Record<string, string>; headers?: unknown }) {
    const { tus, prisma } = await server();
    const created = await tus.onUploadCreate({ headers: params.headers ?? registered() }, { metadata: params.metadata, size: params.blob.length });
    const tusTemp = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTemp, { recursive: true });
    await fs.writeFile(path.join(tusTemp, 'upload-e2ee'), params.blob);
    const finished = await tus
      .onUploadFinish({}, { id: 'upload-e2ee', metadata: created.metadata, size: params.blob.length, storage: undefined })
      .catch((thrown: unknown) => thrown as { status_code?: number; body?: string });
    return { finished, prisma };
  }

  const refusalOf = async (metadata: Record<string, string>, headers?: unknown) => {
    const { tus } = await server();
    return tus.onUploadCreate({ headers: headers ?? registered() }, { metadata, size: 1024 }).then(
      () => null,
      (thrown: { status_code?: number; body?: string }) => thrown,
    );
  };

  it('range le blob tel quel, opaque, sans aucun traitement', async () => {
    const sealed = await encryptAttachment(JPEG_WITH_EXIF);

    const { finished, prisma } = await upload({ blob: sealed.blob, metadata: blobMetadata(sha256(sealed.blob)) });

    expect(finished.status_code).toBe(200);
    const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      mimeType: 'application/octet-stream',
      originalName: '',
      fileSize: sealed.blob.length,
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptedFileHash: sha256(sealed.blob),
      uploadedBy: USER_ID,
      isAnonymous: false,
    });
    for (const absent of ['thumbnailPath', 'thumbnailUrl', 'thumbHash', 'width', 'height', 'duration', 'metadata', 'processingState', 'alt', 'imageVariants', 'renditions', 'loudnessLufs', 'capturedInApp']) {
      expect(data[absent] ?? null).toBeNull();
    }
    expect(String(data.fileName)).toMatch(/^e2ee_[0-9a-f-]{36}\.bin$/);
    const stored = await fs.readFile(path.join(uploadDir, String(data.filePath)));
    expect(Buffer.compare(stored, Buffer.from(sealed.blob))).toBe(0);
    expect([mockExtractMetadata, mockProbe, mockStrip, mockRenditions].every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  it('ne laisse aucune variante ni aucun octet clair sur le disque', async () => {
    const sealed = await encryptAttachment(JPEG_WITH_EXIF);

    await upload({ blob: sealed.blob, metadata: blobMetadata(sha256(sealed.blob)) });

    const files = (await listFiles(uploadDir)).filter((file) => !file.includes('.tus-resumable'));
    expect(files).toHaveLength(1);
    const stored = await fs.readFile(files[0]!);
    expect(stored.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(stored.includes(Buffer.from('GPS-48.8566N'))).toBe(false);
  });

  it('rend une réponse qui ne nomme ni le fichier ni son type', async () => {
    const sealed = await encryptAttachment(JPEG_WITH_EXIF);

    const { finished } = await upload({ blob: sealed.blob, metadata: blobMetadata(sha256(sealed.blob)) });

    const body = JSON.parse(String(finished.body));
    expect(body.data.attachment).toMatchObject({ id: '6add0000000000000000b10b', mimeType: 'application/octet-stream', originalName: '' });
    expect(String(finished.body)).not.toMatch(/jpe?g|image\//i);
  });

  it('refuse un blob dont le condensat n’est pas celui déclaré, et l’efface', async () => {
    const sealed = await encryptAttachment(JPEG_WITH_EXIF);
    const tampered = Uint8Array.from(sealed.blob);
    tampered[20] = (tampered[20] ?? 0) ^ 1;

    const { finished, prisma } = await upload({ blob: tampered, metadata: blobMetadata(sha256(sealed.blob)) });

    expect(finished.status_code).toBe(400);
    expect(String(finished.body)).toContain('E2EE_ATTACHMENT_DIGEST_MISMATCH');
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    expect((await listFiles(uploadDir)).filter((file) => !file.includes('.tus-resumable'))).toHaveLength(0);
  });

  it.each([
    ['un vrai nom de fichier', { filename: 'IMG_0001.jpg' }],
    ['un vrai type', { filetype: 'image/jpeg' }],
    ['une durée', { duration: '12000' }],
    ['une transcription', { transcription: '{"text":"secret"}' }],
    ['une description', { alt: 'ma carte bancaire' }],
    ['un ThumbHash', { thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI' }],
    ['la provenance', { capturedinapp: 'true' }],
  ])('refuse avant le premier octet un blob qui déclare %s', async (_what, extra) => {
    const refusal = await refusalOf(blobMetadata(sha256(new Uint8Array(32)), extra));
    expect(refusal?.status_code).toBe(400);
    expect(String(refusal?.body)).toContain('E2EE_ATTACHMENT_METADATA_REFUSED');
  });

  it.each([
    ['absent', undefined],
    ['qui n’est pas un SHA-256', Buffer.from('court').toString('base64')],
  ])('refuse un condensat %s', async (_what, digest) => {
    const metadata: Record<string, string> = { uploadcontext: 'e2ee-attachment', filetype: 'application/octet-stream', filename: 'blob' };
    if (digest) metadata.digest = digest;
    const refusal = await refusalOf(metadata);
    expect(refusal?.status_code).toBe(400);
    expect(String(refusal?.body)).toContain('E2EE_ATTACHMENT_DIGEST_MISMATCH');
  });

  it('refuse un invité de lien : il n’a aucun appareil chiffrant', async () => {
    const refusal = await refusalOf(blobMetadata(sha256(new Uint8Array(32))), headersFrom({ 'x-session-token': 'anon-session' }));
    expect([401, 403]).toContain(refusal?.status_code);
  });

  it('une pièce ordinaire garde son traitement (le contexte seul ouvre la voie opaque)', async () => {
    mockRenditions.mockResolvedValue({
      storedPath: 'x/y.png', storedMimeType: 'image/png', storedSize: 16, thumbnailPath: null, thumbHash: null, metadata: {},
    });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR')]);

    await upload({ blob: png, metadata: { filename: 'a.png', filetype: 'image/png' } });

    expect(mockRenditions).toHaveBeenCalled();
  });
});
