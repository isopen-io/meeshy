/**
 * POST /attachments/upload — vérification universelle de signature pour un
 * appelant REGISTERED (#3627).
 *
 * Fichier SÉPARÉ de `attachments-upload.test.ts` : y ajouter ce bloc l'aurait
 * fait franchir le seuil de 1000 lignes (`gateway-test-file-size-budget.test.ts`
 * § « règle 3 — le cumul hors budget ne remonte pas »).
 *
 * `matchesDeclaredSignature` (`ContentSignature.ts`) est appliqué à TOUT
 * appelant REGISTERED, avant `classifyAnonymousAttachment` (qui ne s'exécute
 * que pour un appelant anonyme, et RECLASSE plutôt que rejette — déjà
 * couvert par les tests « round 1/2 sécurité » d'`attachments-upload.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageAttachmentSchema: { type: 'object', properties: { id: { type: 'string' } } },
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

const mockUploadMultiple = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: jest.fn(),
  })),
}));

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

const USER_ID = '507f1f77bcf86cd799439011';
const BOUNDARY = 'teststuff123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

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

async function buildRegisteredApp(): Promise<FastifyInstance> {
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
  registerUploadRoutes(app, authOptional, {} as any);
  await app.ready();
  return app;
}

describe('POST /attachments/upload — #3627 : vérification universelle de signature (registered)', () => {
  it('refuse une image déclarée dont les octets ne correspondent pas (PDF déclaré image/png)', async () => {
    const app = await buildRegisteredApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('photo.png', 'image/png', PDF_HEADER),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('refuse un audio déclaré dont les octets ne correspondent pas (PDF déclaré audio/webm)', async () => {
    const app = await buildRegisteredApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('document.pdf', 'audio/webm', PDF_HEADER),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('accepte une vraie image dont les octets correspondent au type déclaré', async () => {
    const app = await buildRegisteredApp();
    try {
      mockUploadMultiple.mockResolvedValue([{ id: 'att-registered-real-jpeg' }]);
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload',
        headers: { 'content-type': CT },
        payload: multipartFileBuffer('photo.jpg', 'image/jpeg', JPEG_HEADER),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
