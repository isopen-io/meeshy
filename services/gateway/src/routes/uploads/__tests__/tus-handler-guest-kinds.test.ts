/**
 * #10001 — sur le chemin RESUMABLE (tus), un invité de World Wide ne joint que
 * du texte `.txt` et de l'audio, prouvés par le fichier ENTIER relu sur disque
 * (un préfixe de 64 octets ne prouve rien) ; le refus porte un code stable.
 * Même harnais que `tus-handler-mime-verification.test.ts`.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { GUEST_ATTACHMENT_MAX_BYTES, GUEST_ATTACHMENT_REFUSAL_CODES } from '@meeshy/shared/types/guest-attachment-kinds';
import {
  EMPTY_ZIP,
  JPEG_PHOTO,
  PDF_DOCUMENT,
  PLAIN_TEXT,
  m4aVoice,
  mp3Frames,
  webmVoice,
} from '../../../services/attachments/__tests__/guest-attachment-fixtures';

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
    probeMediaStreams: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

// ─── Fixtures : octets réels ────────────────────────────────────────────────


const JWT_SECRET = 'test-secret-tus-guest-kinds';
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


describe('tus-handler — un invité de World Wide ne joint que du texte .txt et de l’audio (#10001)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    mockExtractMetadata.mockResolvedValue({});
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-guest-kinds-test-'));
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
    /** `false` : téléversement à longueur différée (`Upload-Defer-Length`), taille inconnue à la création. */
    announceSize?: boolean;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('onUploadCreate/onUploadFinish not captured');

    const uploadId = 'upload-1';
    const created = await captured.onUploadCreate(
      { headers: headersFrom(params.headers) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.announceSize === false ? undefined : params.bytes.length }
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

  function worldGuestPrisma() {
    return buildFakePrisma({
      participant: { id: 'participant-world', anonymousSession: { shareLinkId: 'sharelink-world' } },
      shareLink: {
        allowAnonymousFiles: false,
        allowAnonymousImages: false,
        allowedAttachmentKinds: ['text', 'audio'],
        conversation: { identifier: 'world' },
      },
    });
  }

  const guestHeaders = { 'x-session-token': 'anon-world-token' };

  it.each([
    ['un .txt', 'notes.txt', 'text/plain', PLAIN_TEXT],
    ['un vocal M4A, relu en entier au-delà du préfixe', 'voice.m4a', 'audio/mp4', m4aVoice()],
    ['un vocal WebM', 'voice.webm', 'audio/webm', webmVoice()],
  ])('accepte %s', async (_label, filename, filetype, bytes) => {
    const prisma = worldGuestPrisma();

    const result = await runFullUpload({ prisma, headers: guestHeaders, filename, filetype, bytes });

    expect(result.status_code).toBe(200);
    expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ allowedAttachmentKinds: true }) }),
    );
  });

  it.each([
    ['un PDF', 'doc.pdf', 'application/pdf', PDF_DOCUMENT],
    ['un JPEG renommé .txt', 'photo.txt', 'text/plain', JPEG_PHOTO],
    ['des trames MP3 réelles suivies d’une archive', 'song.mp3', 'audio/mpeg', Buffer.concat([mp3Frames(4), EMPTY_ZIP])],
  ])('refuse %s, détruit le fichier et rend un code stable', async (_label, filename, filetype, bytes) => {
    const prisma = worldGuestPrisma();

    const result = await runFullUpload({ prisma, headers: guestHeaders, filename, filetype, bytes });

    expect(result.status_code).toBe(403);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({ success: false, code: GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED });
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    const stored = await fs.readdir(uploadDir, { recursive: true });
    expect(stored.filter((entry) => String(entry).endsWith(path.extname(filename)))).toEqual([]);
  });

  it('refuse à la fin un fichier à longueur différée au-delà du plafond, sans le charger, avec son propre code', async () => {
    const prisma = worldGuestPrisma();
    const oversized = Buffer.alloc(GUEST_ATTACHMENT_MAX_BYTES + 1, 0x61);

    const result = await runFullUpload({
      prisma,
      headers: guestHeaders,
      filename: 'big.txt',
      filetype: 'text/plain',
      bytes: oversized,
      announceSize: false,
    });

    expect(result.status_code).toBe(413);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({ code: GUEST_ATTACHMENT_REFUSAL_CODES.TOO_LARGE });
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });

  it('refuse AVANT le premier octet un téléversement d’invité annoncé au-delà du plafond', async () => {
    const prisma = worldGuestPrisma();
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(prisma));
    if (!captured) throw new Error('onUploadCreate not captured');

    const refusal = await captured
      .onUploadCreate(
        { headers: headersFrom(guestHeaders) },
        { metadata: { filename: 'big.mp3', filetype: 'audio/mpeg' }, size: GUEST_ATTACHMENT_MAX_BYTES + 1 },
      )
      .then(() => null, (thrown: { status_code?: number; body?: string }) => thrown);

    expect(refusal?.status_code).toBe(413);
    expect(JSON.parse(refusal?.body ?? '{}')).toMatchObject({ code: GUEST_ATTACHMENT_REFUSAL_CODES.TOO_LARGE });
  });
});
