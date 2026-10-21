/**
 * #10001 — sur la route REST d'upload, un invité de World Wide ne joint que du
 * texte `.txt` et de l'audio, prouvés par le contenu ENTIER ; le refus porte un
 * code stable et localisable. Un compte garde ses pièces jointes habituelles.
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { GUEST_ATTACHMENT_REFUSAL_CODES } from '@meeshy/shared/types/guest-attachment-kinds';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockUploadMultiple = jest.fn<any>();
const mockCreateTextAttachment = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: (...a: any[]) => mockCreateTextAttachment(...a),
    validateFile: () => ({ valid: true }),
  })),
}));

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';
import {
  JPEG_PHOTO,
  PDF_DOCUMENT,
  PLAIN_TEXT,
  m4aVoice,
  mp3Frames,
  oggOpusVoice,
  webmVoice,
} from '../../../services/attachments/__tests__/guest-attachment-fixtures';

const BOUNDARY = 'guestkinds123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;
const USER_ID = '507f1f77bcf86cd799439011';

const WORLD_LINK = {
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  allowedAttachmentKinds: ['text', 'audio'],
  conversation: { identifier: 'world' },
};

function multipartFile(filename: string, mimeType: string, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8'),
  ]);
}

function makePrisma(shareLink: unknown = WORLD_LINK) {
  return {
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(shareLink) },
    message: { findFirst: jest.fn<any>().mockResolvedValue({ conversation: { type: 'global' } }) },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: null }) },
  };
}

async function buildApp(options: { readonly anonymous: boolean; readonly prisma: ReturnType<typeof makePrisma> }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } }, bodyLimit: 50 * 1024 * 1024 });
  const auth = async (req: any) => {
    req.authContext = options.anonymous
      ? {
          isAuthenticated: true,
          isAnonymous: true,
          userId: 'part-world',
          participantId: 'part-world',
          anonymousUser: { shareLinkId: 'sl-world', username: 'Ama' },
        }
      : { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' }, participantId: null };
  };
  await app.register(multipart);
  registerUploadRoutes(app, auth, options.prisma as any);
  await app.ready();
  return app;
}

describe('POST /attachments/upload — invité de World Wide', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-world' }]);
    prisma = makePrisma();
    app = await buildApp({ anonymous: true, prisma });
  });
  afterAll(async () => {
    await app.close();
  });

  const upload = (filename: string, mimeType: string, content: Buffer) =>
    app.inject({ method: 'POST', url: '/attachments/upload', headers: { 'content-type': CT }, payload: multipartFile(filename, mimeType, content) });

  it.each([
    ['un .txt', 'notes.txt', 'text/plain', PLAIN_TEXT],
    ['un vocal M4A', 'voice.m4a', 'audio/mp4', m4aVoice()],
    ['un vocal WebM', 'voice.webm', 'audio/webm', webmVoice()],
    ['un Ogg', 'voice.ogg', 'audio/ogg', oggOpusVoice()],
    ['un MP3', 'song.mp3', 'audio/mpeg', mp3Frames(4)],
  ])('accepte %s', async (_label, filename, mimeType, content) => {
    const res = await upload(filename, mimeType, content);
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['un PDF', 'doc.pdf', 'application/pdf', PDF_DOCUMENT],
    ['une photo', 'photo.jpg', 'image/jpeg', JPEG_PHOTO],
    ['un JPEG renommé .txt', 'photo.txt', 'text/plain', JPEG_PHOTO],
  ])('refuse %s avec un code stable', async (_label, filename, mimeType, content) => {
    const res = await upload(filename, mimeType, content);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED });
  });

  it('lit la liste des familles du lien et la conversation qu’il ouvre', async () => {
    await upload('notes.txt', 'text/plain', PLAIN_TEXT);
    expect(prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ allowedAttachmentKinds: true, conversation: { select: { identifier: true } } }),
      }),
    );
  });
});

describe('POST /attachments/upload-text — invité de World Wide', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-text' });
    app = await buildApp({ anonymous: true, prisma: makePrisma() });
  });
  afterAll(async () => {
    await app.close();
  });

  it('crée un texte même quand la porte des fichiers génériques est fermée : la famille « text » est ouverte', async () => {
    const res = await app.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'Bonjour le monde' } });
    expect(res.statusCode).toBe(200);
  });

  it('refuse un texte porteur de caractères de contrôle, avec un code stable', async () => {
    const res = await app.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'abc\u0000def' } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED });
  });

  it('refuse un texte quand le lien ne l’ouvre pas', async () => {
    const audioOnly = await buildApp({ anonymous: true, prisma: makePrisma({ ...WORLD_LINK, allowedAttachmentKinds: ['audio'] }) });
    const res = await audioOnly.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'Bonjour' } });
    await audioOnly.close();
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — un compte dans World Wide', () => {
  it('joint une image : la restriction ne vise que les invités', async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-account' }]);
    const prisma = makePrisma();
    const app = await buildApp({ anonymous: false, prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg', JPEG_PHOTO),
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
  });
});
