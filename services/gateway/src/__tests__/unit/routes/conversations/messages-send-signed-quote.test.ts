/**
 * #18470 — la réponse d'envoi rend à l'expéditeur la CITATION d'une pièce
 * scellée au repos (#13100) sous SES adresses signées, la protection lue sur la
 * ligne citée brute ; une citation d'une autre conversation part telle quelle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSendMessageRoute } from '../../../../routes/conversations/messages-send';
import { checkReaderFileToken, readSigningKeys } from '../../../../services/attachments/readerFileSignature';

const SIGNING_KEY = Buffer.alloc(32, 5).toString('base64');
const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: SIGNING_KEY });
const CONV_ID = '507f1f77bcf86cd799439022';
const SENDER = '507f1f77bcf86cd799439099';
const SEALED_FILE = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35.webp';
const SEALED_THUMB = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35_thumb.webp';
const ORDINARY = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  (request as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, isAnonymous: true, participantId: SENDER };
}

const savedRow = (quotedConversationId: string) => ({
  id: '507f1f77bcf86cd799439088',
  conversationId: CONV_ID,
  senderId: SENDER,
  content: 'joli',
  isDuplicate: true,
  ...ORDINARY,
  attachments: [],
  replyTo: {
    id: '507f1f77bcf86cd799439077',
    conversationId: quotedConversationId,
    content: '',
    messageType: 'image',
    ...ORDINARY,
    attachments: [{ id: '507f1f77bcf86cd799439066', mimeType: 'image/webp', fileUrl: SEALED_FILE, thumbnailUrl: SEALED_THUMB, ...ORDINARY }],
  },
});

async function buildApp(data: ReturnType<typeof savedRow>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const handleMessage = jest.fn(async () => ({ success: true, data }));
  registerSendMessageRoute(
    app as never,
    { participant: { findFirst: jest.fn() }, conversation: { findUnique: jest.fn(), findFirst: jest.fn() } } as never,
    fakeOptionalAuth as never,
    () => ({ handleMessage }) as never,
    null as never
  );
  await app.ready();
  return app;
}

const readerOf = (url: unknown): string | null => {
  const match = typeof url === 'string' ? /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url) : null;
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: KEYS, now: new Date() });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

type QuotedPiece = { readonly fileUrl: unknown; readonly thumbnailUrl: unknown };

describe('POST /conversations/:id/messages — la citation scellée signée pour l’expéditeur (#18470)', () => {
  const previous = process.env.ATTACHMENT_URL_SIGNING_KEY;
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (previous === undefined) delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    else process.env.ATTACHMENT_URL_SIGNING_KEY = previous;
  });

  const quotedPieceSent = async (quotedConversationId: string): Promise<QuotedPiece | undefined> => {
    process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
    app = await buildApp(savedRow(quotedConversationId));
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/messages`, payload: { content: 'joli' } });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { replyTo: { attachments: QuotedPiece[] } } }).data.replyTo.attachments[0];
  };

  it('signe la vignette et le fichier de la pièce citée pour l’expéditeur', async () => {
    const piece = await quotedPieceSent(CONV_ID);
    expect(readerOf(piece?.thumbnailUrl)).toBe(SENDER);
    expect(readerOf(piece?.fileUrl)).toBe(SENDER);
  });

  it('laisse telle quelle la citation d’une autre conversation', async () => {
    const piece = await quotedPieceSent('507f1f77bcf86cd799439023');
    expect(piece?.thumbnailUrl).toBe(SEALED_THUMB);
  });
});
