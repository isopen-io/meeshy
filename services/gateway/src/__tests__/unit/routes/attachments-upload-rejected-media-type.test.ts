/**
 * `POST /attachments/upload` — refus de type/taille AVANT tout octet écrit
 * (#6604). Extrait de `attachments-upload.test.ts` pour rester sous le
 * budget de taille (#4531) : un fichier de tests par PRÉOCCUPATION, pas un
 * seul fichier qui grossit sans fin.
 *
 * `UploadProcessor.validateFile()` rejetait déjà un type déclaré qui ne
 * correspond pas au contenu réel, ou une taille hors limite — mais via
 * `throw new Error(...)` NU (sans statusCode), avalé silencieusement par
 * `uploadMultiple` (200 partiel) ou dégénérant en 500 générique pour tout
 * appelant qui ne l'avale pas. La route valide désormais chaque fichier du
 * lot AVANT l'upload et répond 415/413 via `sendError()`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

// #4649 — ne PAS bouchonner `@meeshy/shared/types/api-schemas` : le schéma
// RÉEL est ce qui garde `fast-json-stringify` armé, et c'est précisément ce
// que ces témoins vérifient (le corps 415/413 servi, pas un double qui
// désarmerait la sérialisation).

const mockUploadMultiple = jest.fn<any>();
const mockValidateFile = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: jest.fn(),
    validateFile: (...a: any[]) => mockValidateFile(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

// ─── Constants & fixtures ──────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const BOUNDARY = 'teststuff123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
// PDF réel — l'exploit documenté déclare ces octets sous un Content-Type image/*.
const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');

/**
 * Variante binaire de multipart : `content` est un `Buffer` d'octets réels,
 * préservés bit à bit (contrairement à un payload `string`, ré-encodé en
 * UTF-8 par light-my-request — corromprait toute signature > 0x7F).
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

function makePrisma() {
  return {
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } }, bodyLimit: 50 * 1024 * 1024 });

  const authOptional = async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
      participantId: null,
    };
  };

  await app.register(multipart);
  registerUploadRoutes(app, authOptional, makePrisma() as any);
  await app.ready();
  return app;
}

// ─── POST /attachments/upload — rejected media type (#6604) ───────────────────

describe('POST /attachments/upload — rejected media type (#6604)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('renvoie 415 (jamais 500) quand le type déclaré ne correspond pas au contenu, avec un code exploitable et un message qui nomme le type reçu', async () => {
    mockUploadMultiple.mockClear();
    mockValidateFile.mockReturnValue({
      valid: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      error: 'Declared type "image/png" does not match any known image signature',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('fake.png', 'image/png', PDF_HEADER),
    });

    expect(res.statusCode).toBe(415);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(body.error).toContain('image/png');
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });

  it('renvoie 413 (jamais 500) quand un fichier dépasse la limite de sa catégorie', async () => {
    mockUploadMultiple.mockClear();
    mockValidateFile.mockReturnValue({
      valid: false,
      code: 'FILE_TOO_LARGE',
      error: 'Fichier trop volumineux. Taille max: 10GB',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer('huge.jpg', 'image/jpeg', JPEG_HEADER),
    });

    expect(res.statusCode).toBe(413);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('FILE_TOO_LARGE');
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });

  it("refuse la requête ENTIÈRE quand un seul fichier d'un lot multiple est rejeté, sans en téléverser aucun", async () => {
    mockUploadMultiple.mockClear();
    mockValidateFile
      .mockReturnValueOnce({ valid: true })
      .mockReturnValueOnce({ valid: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Declared type "image/png" does not match any known image signature' });
    const payload = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="good.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`, 'utf8'),
      JPEG_HEADER,
      Buffer.from(`\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="bad.png"\r\nContent-Type: image/png\r\n\r\n`, 'utf8'),
      PDF_HEADER,
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8'),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload,
    });

    expect(res.statusCode).toBe(415);
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });
});
