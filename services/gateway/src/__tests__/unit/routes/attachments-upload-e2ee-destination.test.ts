/**
 * `POST /attachments/upload` — la pièce d'un message déclare sa conversation (#13820).
 *
 * `attachments/upload` ne connaissait pas la conversation : un client qui partageait
 * une photo hors ligne vers une conversation passée en e2ee entre-temps voyait, au
 * retour du réseau, le FICHIER gardé en clair par la passerelle — seul le message
 * était refusé ensuite (`E2EE_PLAINTEXT_REFUSED`). Le champ multipart OPTIONNEL
 * `conversationId` dit désormais la destination : présente et chiffrée de bout en
 * bout, la pièce n'est jamais STOCKÉE : le corps est lu jusqu'au bout (un client
 * HTTP/1.1 l'écrit en entier avant de lire la réponse), ses octets sont jetés, puis
 * le refus part. Absent, rien ne
 * change (rétrocompatible, #9223).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import net from 'node:net';

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
const E2EE_ID = '65a000000000000000000001';
const SERVER_ID = '65a000000000000000000002';
const FOREIGN_ID = '65a000000000000000000003';
const BOUNDARY = 'destination13820';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const field = (name: string, value: string): Buffer =>
  Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8');

const file = (): Buffer =>
  Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      'utf8',
    ),
    JPEG,
    Buffer.from('\r\n', 'utf8'),
  ]);

const body = (...parts: Buffer[]): Buffer => Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8')]);

const modes: Record<string, string | null> = { [E2EE_ID]: 'e2ee', [SERVER_ID]: 'server' };

const prisma = {
  conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  participant: {
    findFirst: jest.fn<any>(async ({ where }: any) =>
      where.conversationId in modes && where.userId === USER_ID ? { id: `p-${where.conversationId}` } : null,
    ),
  },
  conversation: {
    findFirst: jest.fn<any>(async ({ where }: any) => (where.identifier === 'meeshy' ? { id: SERVER_ID } : null)),
    findUnique: jest.fn<any>(async ({ where }: any) =>
      where.id in modes ? { id: where.id, encryptionMode: modes[where.id] } : null,
    ),
  },
};

async function buildApp(multipartOptions: Record<string, unknown> = {}): Promise<FastifyInstance> {
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
  await app.register(multipart, multipartOptions);
  registerUploadRoutes(app, authOptional, prisma as any);
  await app.ready();
  return app;
}

const upload = (app: FastifyInstance, payload: Buffer) =>
  app.inject({ method: 'POST', url: '/attachments/upload', headers: { 'content-type': CT }, payload });

describe('POST /attachments/upload — la conversation de destination (#13820)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mockUploadMultiple.mockReset().mockResolvedValue([{ id: 'att-1' }]);
    mockValidateFile.mockReset().mockReturnValue({ valid: true });
    prisma.participant.findFirst.mockClear();
    prisma.conversation.findUnique.mockClear();
  });

  it('refuse la pièce destinée à une conversation chiffrée de bout en bout : rien n’est validé ni stocké', async () => {
    const res = await upload(app, body(field('conversationId', E2EE_ID), file()));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_PLAINTEXT_REFUSED' });
    expect(mockValidateFile).not.toHaveBeenCalled();
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });

  it('refuse aussi quand le champ suit le fichier : rien n’est écrit', async () => {
    const res = await upload(app, body(file(), field('conversationId', E2EE_ID)));

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('E2EE_PLAINTEXT_REFUSED');
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });

  it('téléverse la pièce destinée à une conversation lue par le serveur', async () => {
    const res = await upload(app, body(field('conversationId', SERVER_ID), file()));

    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledTimes(1);
  });

  it('une conversation dont l’appelant n’est pas membre est introuvable, sans dire son mode, et rien n’est écrit', async () => {
    const res = await upload(app, body(field('conversationId', FOREIGN_ID), file()));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });

  it('une conversation désignée par son identifiant lisible, comme pour les routes voisines, est acceptée', async () => {
    const res = await upload(app, body(field('conversationId', 'meeshy'), file()));

    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledTimes(1);
  });

  it('un identifiant lisible inconnu est introuvable, sans lire l’appartenance', async () => {
    const res = await upload(app, body(field('conversationId', 'mshy_pas-un-id'), file()));

    expect(res.statusCode).toBe(404);
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
    expect(mockUploadMultiple).not.toHaveBeenCalled();
    const foreign = await upload(app, body(field('conversationId', FOREIGN_ID), file()));
    expect(res.json()).toEqual(foreign.json());
  });

  it('sans le champ, le téléversement est inchangé et ne lit aucune conversation (rétrocompatible)', async () => {
    const res = await upload(app, body(file()));

    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledTimes(1);
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /attachments/upload — une destination refusée lit le corps jusqu’au bout (#13820)', () => {
  let app: FastifyInstance;
  let port: number;
  beforeAll(async () => {
    app = await buildApp({ limits: { fileSize: 64 * 1024 * 1024 } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mockUploadMultiple.mockReset().mockResolvedValue([{ id: 'att-1' }]);
  });

  it('jette les 2 Mio d’une pièce destinée à une conversation e2ee, puis répond 400 : le client n’est jamais bloqué', async () => {
    const SIZE = 2 * 1024 * 1024;
    const head = Buffer.concat([
      field('conversationId', E2EE_ID),
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="v.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
        'utf8',
      ),
    ]);
    const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8');
    const socket = net.connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    let response = '';
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });

    socket.write(
      `POST /attachments/upload HTTP/1.1\r\nHost: x\r\nContent-Type: ${CT}\r\nContent-Length: ${head.length + SIZE + tail.length}\r\n\r\n`,
    );
    socket.write(head);
    socket.write(Buffer.alloc(SIZE, 7));
    socket.write(tail);
    const deadline = Date.now() + 3000;
    while ((socket.writableLength > 0 || !response.includes('E2EE_PLAINTEXT_REFUSED')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const stillQueued = socket.writableLength;
    socket.destroy();

    expect(stillQueued).toBe(0);
    expect(response.split('\r\n')[0]).toMatch(/^HTTP\/1\.1 400/);
    expect(response).toContain('E2EE_PLAINTEXT_REFUSED');
    expect(mockUploadMultiple).not.toHaveBeenCalled();
  });
});
