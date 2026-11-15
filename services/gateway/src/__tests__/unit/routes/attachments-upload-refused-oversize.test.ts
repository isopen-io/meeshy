/**
 * @jest-environment node
 *
 * #13820 — une pièce refusée (conversation chiffrée de bout en bout) dont le corps
 * dépasse `limits.fileSize` rend le refus e2ee, jamais un 500 ; une connexion
 * coupée au milieu ne laisse pas la route hors d’usage.
 */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import net from 'node:net';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));
const mockUploadMultiple = jest.fn<any>().mockResolvedValue([{ id: 'att-1' }]);
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: jest.fn(),
    validateFile: () => ({ valid: true }),
  })),
}));
import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

const USER_ID = '507f1f77bcf86cd799439011';
const E2EE_ID = '65a000000000000000000001';
const B = 'w13820s';
const prisma = {
  conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  participant: { findFirst: jest.fn<any>(async () => ({ id: 'p' })) },
  conversation: { findUnique: jest.fn<any>(async () => ({ id: E2EE_ID, encryptionMode: 'e2ee' })) },
};

async function raw(port: number, size: number, cut: boolean): Promise<string> {
  const head = Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="conversationId"\r\n\r\n${E2EE_ID}\r\n--${B}\r\nContent-Disposition: form-data; name="files"; filename="v.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${B}--\r\n`);
  const s = net.connect(port, '127.0.0.1');
  await new Promise<void>((r) => s.once('connect', () => r()));
  let response = '';
  s.on('data', (d) => { response += d.toString(); });
  s.on('error', () => undefined);
  s.write(`POST /attachments/upload HTTP/1.1\r\nHost: x\r\nContent-Type: multipart/form-data; boundary=${B}\r\nContent-Length: ${head.length + size + tail.length}\r\n\r\n`);
  s.write(head);
  if (cut) {
    s.write(Buffer.alloc(size / 2, 1));
    await new Promise((r) => setTimeout(r, 100));
    s.destroy();
    return 'cut';
  }
  s.write(Buffer.alloc(size, 1));
  s.write(tail);
  const deadline = Date.now() + 3000;
  while (!response.includes('\r\n\r\n') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 100));
  s.destroy();
  return response;
}

describe('POST /attachments/upload — le corps d’une destination refusée, au-delà de la limite de taille (#13820)', () => {
  let app: FastifyInstance;
  let port: number;
  beforeAll(async () => {
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    await app.register(multipart, { limits: { fileSize: 1024 } });
    registerUploadRoutes(app, async (req: any) => {
      req.authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' }, participantId: null };
    }, prisma as any);
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as AddressInfo).port;
  });
  afterAll(async () => { await app.close(); });

  it('une pièce refusée e2ee qui dépasse la limite de taille rend quand même le refus e2ee', async () => {
    const res = await raw(port, 64 * 1024, false);
    expect(res.split('\r\n')[0]).toMatch(/^HTTP\/1\.1 400/);
    expect(res).toContain('E2EE_PLAINTEXT_REFUSED');
  });

  it('un client qui coupe au milieu ne laisse pas la passerelle hors d’usage', async () => {
    await raw(port, 64 * 1024, true);
    await new Promise((r) => setTimeout(r, 200));
    const res = await raw(port, 512, false);
    expect(res).toContain('E2EE_PLAINTEXT_REFUSED');
  });
});
