/**
 * `POST /attachments/upload` — une carte de visite est toujours stockée
 * `text/vcard` (#8101), quel que soit l'alias que le navigateur ou le système
 * déclare (`text/x-vcard`, `application/octet-stream` + `.vcf`) : les lecteurs
 * web et iOS la reconnaissent par ce type canonique.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockUploadMultiple = jest.fn<any>();
const mockValidateFile = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: jest.fn(),
    validateFile: (...a: any[]) => mockValidateFile(...a),
  })),
}));

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

const USER_ID = '507f1f77bcf86cd799439011';
const BOUNDARY = 'teststuff123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;
const VCARD = Buffer.from('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Awa Diallo\r\nTEL:+33612345678\r\nEND:VCARD\r\n', 'utf8');

function multipartFile(filename: string, mimeType: string, content: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `\r\n`,
    'utf8'
  );
  return Buffer.concat([head, content, Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8')]);
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authOptional = async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
      participantId: null,
    };
  };
  await app.register(multipart);
  registerUploadRoutes(app, authOptional, { conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) } } as any);
  await app.ready();
  return app;
}

describe('POST /attachments/upload — carte de visite (#8101)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const storedMimeType = async (filename: string, declared: string): Promise<unknown> => {
    mockUploadMultiple.mockReset().mockResolvedValue([]);
    mockValidateFile.mockReset().mockReturnValue({ valid: true });
    await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile(filename, declared, VCARD),
    });
    const files = mockUploadMultiple.mock.calls[0]?.[0] as Array<{ mimeType: string }> | undefined;
    return files?.[0]?.mimeType;
  };

  it('stocke un text/x-vcard sous text/vcard', async () => {
    expect(await storedMimeType('awa.vcf', 'text/x-vcard')).toBe('text/vcard');
  });

  it('reconnaît un .vcf déclaré application/octet-stream', async () => {
    expect(await storedMimeType('Awa Diallo.vcf', 'application/octet-stream')).toBe('text/vcard');
  });

  it('laisse intact un type qui n’est pas une carte', async () => {
    expect(await storedMimeType('notes.txt', 'text/plain')).toBe('text/plain');
  });
});
