/**
 * `POST /attachments/upload` — un .wav, un .mp3 ou un .mp4 est admis sous le
 * type de ce qu'il EST, pas sous le nom que le système de l'expéditeur lui a
 * donné (#9693) : `audio/x-wav` devient `audio/wav`, un MP3 sans type devient
 * `audio/mpeg` quand ses octets le confirment.
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

const WAV_BYTES = Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'), Buffer.alloc(32)]);
const MP3_BYTES = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary');
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

describe('POST /attachments/upload — le type admis est celui du média (#9693)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    mockValidateFile.mockReturnValue({ valid: true });
    mockUploadMultiple.mockResolvedValue([]);
  });
  afterAll(async () => { await app.close(); });

  async function admittedTypeOf(filename: string, declared: string, content: Buffer): Promise<string> {
    mockUploadMultiple.mockClear();
    await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileBuffer(filename, declared, content),
    });
    return mockUploadMultiple.mock.calls[0][0][0].mimeType;
  }

  it('admet un WAV nommé audio/x-wav sous audio/wav', async () => {
    expect(await admittedTypeOf('note.wav', 'audio/x-wav', WAV_BYTES)).toBe('audio/wav');
  });

  it('admet un MP3 envoyé sans type sous audio/mpeg', async () => {
    expect(await admittedTypeOf('chanson.mp3', 'application/octet-stream', MP3_BYTES)).toBe('audio/mpeg');
  });

  it('garde le type générique quand les octets démentent l’extension', async () => {
    expect(await admittedTypeOf('faux.mp3', 'application/octet-stream', PDF_HEADER)).toBe('application/octet-stream');
  });
});
