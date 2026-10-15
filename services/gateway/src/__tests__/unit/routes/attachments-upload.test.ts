/**
 * Unit tests for attachments/upload.ts
 * Tests POST /attachments/upload (POST /attachments/upload-text : attachments-upload-text.test.ts)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageAttachmentSchema: { type: 'object', properties: { id: { type: 'string' } } },
  // `error`/`message`/`code` déclarés (comme le vrai `errorResponseSchema`,
  // #4884) — un schéma sans `properties` EFFACE via fast-json-stringify
  // (`additionalProperties: false` par défaut) : sans eux, un témoin de
  // comportement qui inspecte le CORPS d'une erreur (#6604) passerait sur un
  // faux vide plutôt que sur ce que la route sert réellement.
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

const mockUploadMultiple = jest.fn<any>();
const mockCreateTextAttachment = jest.fn<any>();
// #6604 — la route valide chaque fichier AVANT l'upload ; le défaut « valide »
// laisse tous les témoins existants (qui n'exercent pas ce refus) inchangés.
const mockValidateFile = jest.fn<any>().mockReturnValue({ valid: true });

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: (...a: any[]) => mockCreateTextAttachment(...a),
    validateFile: (...a: any[]) => mockValidateFile(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const BOUNDARY = 'teststuff123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function multipartFile(filename: string, mimeType: string, content = 'FAKEDATA'): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

function multipartFileWithMetadata(filename: string, mimeType: string, metadataJson: string): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `FAKEDATA\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="metadata_0"\r\n` +
    `\r\n` +
    `${metadataJson}\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

function multipartFileWithExtraField(filename: string, mimeType: string): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `FAKEDATA\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="other_field"\r\n` +
    `\r\n` +
    `some_value\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

/**
 * Variante binaire de `multipartFile` : `content` est un `Buffer` d'octets
 * réels, préservés bit à bit (contrairement à un payload `string`, ré-encodé
 * en UTF-8 par light-my-request — corromprait toute signature > 0x7F).
 * Nécessaire pour les tests round 1 sécurité : la classification audio/image
 * se mérite désormais par les octets, un `content` texte quelconque ne
 * distinguerait plus un vocal légitime d'un document usurpant le déclaratif.
 */
function multipartFileBuffer(filename: string, mimeType: string, content: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8');
  return Buffer.concat([head, content, tail]);
}

// ─── Signatures binaires réelles (round 1 sécurité) ────────────────────────────
// Octets d'en-tête authentiques des conteneurs produits par les clients Meeshy
// pour un message vocal (voir `ContentSignature.ts` pour la provenance exacte :
// web `MediaRecorder` → WebM/EBML, MP4/ftyp (Safari), Ogg ; iOS
// `AVAudioRecorder` codec .aac par défaut → M4A/MP4/ftyp), plus WAV/MP3
// puisque `isAudioMimeType` (packages/shared) les reconnaît déjà.

const WEBM_HEADER = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // EBML magic
  Buffer.from([0x42, 0x82, 0x84]), // élément EBML DocType (id 0x4282, taille 4)
  Buffer.from('webm', 'ascii'),
]); // EBML (WebM)
const MP4_M4A_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypM4A ', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('M4A mp42isom', 'ascii'),
]); // MP4/M4A — AVAudioRecorder .aac (iOS), MediaRecorder Safari
const MP3_HEADER = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary'); // MP3 (tag ID3v2)
const WAV_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVEfmt ', 'ascii'),
]); // WAV (RIFF/WAVE/fmt )
const PNG_HEADER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature officielle
  Buffer.from([0x00, 0x00, 0x00, 0x0d]), // longueur du chunk IHDR = 13 (constante du format)
  Buffer.from('IHDR', 'ascii'),
]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
// PDF réel — l'exploit documenté déclare ces octets sous un Content-Type audio/*.
const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(
  shareLink: any = { allowAnonymousFiles: true, allowAnonymousImages: true },
  target: { conversationType?: string; birthDate?: Date | null } = {}
) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(shareLink),
    },
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({ conversation: { type: target.conversationType ?? 'group' } }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ birthDate: target.birthDate ?? null }),
    },
  };
}

async function buildApp({
  authenticated = true,
  isAnonymous = false,
  participantId = null as string | null,
  prisma = makePrisma() as any,
}: {
  authenticated?: boolean;
  isAnonymous?: boolean;
  participantId?: string | null;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  // `bodyLimit` aligné sur `server.ts` (50MB), comme en production.
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } }, bodyLimit: 50 * 1024 * 1024 });

  const authOptional = async (req: any) => {
    if (!authenticated && !isAnonymous) return;
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
        participantId: null,
      };
    } else if (isAnonymous) {
      (req as any).authContext = {
        // Un participant anonyme MUNI d'un jeton de session valide porte
        // `isAuthenticated: true` (cf. `createAnonymousUserContext`). Seul le
        // visiteur nu a `isAuthenticated: false` — et c'est lui que cette
        // fixture décrivait, ce qui masquait la garde cassée des routes.
        isAuthenticated: true,
        isAnonymous: true,
        userId: 'anon-session',
        participantId,
        anonymousUser: { shareLinkId: 'sl-001', username: 'AnonUser' },
      };
    }
  };

  await app.register(multipart);
  registerUploadRoutes(app, authOptional, prisma);
  await app.ready();
  return app;
}

// ─── POST /attachments/upload ─────────────────────────────────────────────────

describe('POST /attachments/upload — not authenticated (no authContext)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/attachments/upload' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /attachments/upload — no files', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when no files are provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: '-----boundary--\r\n',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /attachments/upload — authenticated success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-1', fileUrl: 'http://example.com/f.jpg' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with attachments on successful upload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('photo.jpg', 'image/jpeg', JPEG_HEADER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.attachments).toHaveLength(1);
  });

  it('calls uploadMultiple with the file, userId, isAnonymous=false, and no metadataMap', async () => {
    mockUploadMultiple.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('doc.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ filename: 'doc.pdf', mimeType: 'application/pdf' })]),
      USER_ID,
      false,
      undefined,
      undefined,
    );
  });
});

describe('POST /attachments/upload — with metadata field', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-2' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('passes metadataMap when valid metadata_0 field is included', async () => {
    mockUploadMultiple.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileWithMetadata('video.mp4', 'video/mp4', JSON.stringify({ duration: 42 })),
    });
    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ filename: 'video.mp4' })]),
      USER_ID,
      false,
      undefined,
      expect.any(Map),
    );
  });
});

describe('POST /attachments/upload — invalid metadata JSON', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-3' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('ignores unparseable metadata and still returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      // application/octet-stream : hors du périmètre image/audio de
      // `verifyDeclaredMimeType` (#5615) — ce test exerce le parsing de
      // métadonnées, pas la vérification de signature de contenu.
      payload: multipartFileWithMetadata('photo.bin', 'application/octet-stream', '{not valid json}'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — non-metadata field ignored', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-extra' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('ignores fields whose name does not start with metadata_ and returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      // application/octet-stream : hors du périmètre image/audio de
      // `verifyDeclaredMimeType` (#5615) — ce test exerce l'ignorance d'un
      // champ hors-contrat, pas la vérification de signature de contenu.
      payload: multipartFileWithExtraField('photo.bin', 'application/octet-stream'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockRejectedValue(new Error('storage failure'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 when uploadMultiple throws', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('photo.jpg', 'image/jpeg', JPEG_HEADER),
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 with fallback message when error has no message property', async () => {
    const errWithoutMessage = new Error();
    (errWithoutMessage as any).message = '';
    mockUploadMultiple.mockRejectedValue(errWithoutMessage);
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('photo.jpg', 'image/jpeg', JPEG_HEADER),
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /attachments/upload — anonymous, non-image file allowed', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-pdf' }]);
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous user uploads allowed non-image file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('document.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — anonymous, shareLink not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma(null),
    });
  });
  afterAll(async () => { await app.close(); });

  // #4856 — le lien recherché est celui de la SESSION anonyme appelante,
  // jamais celui d'un tiers : son absence est un « je ne trouve pas », pas
  // un refus d'accès. Le texte disait déjà « not found » sous un 403.
  it('returns 404 when share link does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /attachments/upload — anonymous, image upload blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous image upload is not allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('photo.jpg', 'image/jpeg', JPEG_HEADER),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous, non-image file upload blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous file upload is not allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('document.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous voice message allowed even when files and images are blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-voice' }]);
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('accepte un message vocal anonyme même quand les fichiers sont interdits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('voice.webm', 'audio/webm', WEBM_HEADER),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — un invité de World Wide ne fait pas passer un en-tête MPEG pour un audio (audit #10000, #10029)', () => {
  const WORLD_LINK = { allowAnonymousFiles: false, allowAnonymousImages: false, conversation: { identifier: 'world' } };
  const MPEG_SYNC_THEN_HTML = Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.from('<html><script>alert(1)</script></html>', 'latin1')]);
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-world-guest' }]);
    prisma = makePrisma(WORLD_LINK);
    app = await buildApp({ authenticated: false, isAnonymous: true, participantId: 'part-world', prisma });
  });
  afterAll(async () => { await app.close(); });

  it('refuse deux octets de synchro MPEG suivis de HTML déclarés audio/mpeg, et lit la conversation du lien', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('voice.mp3', 'audio/mpeg', MPEG_SYNC_THEN_HTML),
    });

    expect(res.statusCode).toBe(403);
    expect(prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ conversation: { select: { identifier: true } } }) }),
    );
  });
});

describe('POST /attachments/upload — anonymous voice message allowed regardless of audio subtype', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-voice' }]);
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it.each([
    ['audio/mp4', MP4_M4A_HEADER] as const,
    ['audio/mpeg', MP3_HEADER] as const,
    ['audio/wav', WAV_HEADER] as const,
  ])(
    'accepte un enregistrement audio anonyme quel que soit le sous-type (%s)',
    async (mimeType, header) => {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('voice.audio', mimeType, header),
      });
      expect(res.statusCode).toBe(200);
    },
  );
});

describe('POST /attachments/upload — anonymous document still blocked when files are forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('refuse toujours un document anonyme quand les fichiers sont interdits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('document.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous image still blocked when images are forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('refuse toujours une image anonyme quand les images sont interdites', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('photo.png', 'image/png', PNG_HEADER),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — round 1 sécurité : l\'exemption se mérite par les octets', () => {
  it('refuse un PDF déclaré audio/webm quand fichiers et images sont interdits (contournement task-1-fix-round-1)', async () => {
    const app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: false }),
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('document.pdf', 'audio/webm', PDF_HEADER),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('refuse un PDF déclaré image/png quand les fichiers sont interdits (recoupement image/fichier)', async () => {
    const app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: true }),
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('document.pdf', 'image/png', PDF_HEADER),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('accepte un vrai message vocal (octets webm authentiques) même quand fichiers et images sont interdits', async () => {
    const app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: false }),
    });
    try {
      mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-voice-round1' }]);
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('voice.webm', 'audio/webm', WEBM_HEADER),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /attachments/upload — round 2 sécurité : casse du Content-Type déclaré', () => {
  it('refuse une vraie image déclarée IMAGE/PNG en majuscules quand les images sont interdites (task-1-fix-round-2, Important)', async () => {
    const app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      // Fichiers autorisés, images interdites : avant la normalisation de
      // casse, `.startsWith('image/')` sur 'IMAGE/PNG' était `false`, donc
      // classé « fichier » et laissé passer par `allowAnonymousFiles: true`
      // — précisément le contournement décrit dans le round 2.
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: false }),
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('photo.png', 'IMAGE/PNG', PNG_HEADER),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('accepte toujours un vocal déclaré AUDIO/WEBM en majuscules quand fichiers et images sont interdits', async () => {
    const app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: false }),
    });
    try {
      mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-voice-uppercase' }]);
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('voice.webm', 'AUDIO/WEBM', WEBM_HEADER),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /attachments/upload — anonymous without participantId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon' }]);
    app = await buildApp({ authenticated: false, isAnonymous: true, participantId: null });
  });
  afterAll(async () => { await app.close(); });

  it('skips permission check and returns 200 when participantId is null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(200);
  });
});
