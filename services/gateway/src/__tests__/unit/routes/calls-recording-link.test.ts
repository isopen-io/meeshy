import { describe, it, expect, jest } from '@jest/globals';
import { callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';

jest.mock('../../../middleware/validation', () => ({ createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/rate-limit', () => ({ ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} } }));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { registerCallsRecordingRoutes } from '../../../routes/calls-recording';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Where[]).every((w) => matches(row, w));
    if (key === 'OR') return (condition as Where[]).some((w) => matches(row, w));
    if (key === 'NOT') return !matches(row, condition as Where);
    const value = row[key];
    if (condition === null) return value === null;
    if (typeof condition === 'object' && condition !== null && 'isSet' in condition) return (value !== undefined) === (condition as { isSet: boolean }).isSet;
    if (typeof condition === 'object' && condition !== null && 'has' in condition) return Array.isArray(value) && value.includes((condition as { has: unknown }).has);
    return value === condition;
  });

const table = (initial: Row[]) => {
  const state = { rows: initial };
  return {
    state,
    findUnique: async ({ where }: { where: Where }) => state.rows.find((row) => matches(row, where)) ?? null,
    findFirst: async ({ where }: { where: Where }) => state.rows.find((row) => matches(row, where)) ?? null,
    findUniqueOrThrow: async ({ where }: { where: Where }) => {
      const found = state.rows.find((row) => matches(row, where));
      if (!found) throw new Error('not found');
      return { ...found, attachments: [] };
    },
    findMany: async ({ where }: { where: { id: { in: string[] } } }) => state.rows.filter((row) => where.id.in.includes(row.id as string)),
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hits = state.rows.filter((row) => matches(row, where));
      state.rows = state.rows.map((row) => (hits.includes(row) ? { ...row, ...data } : row));
      return { count: hits.length };
    },
  };
};

const CALL = '64b7f0c2a1b2c3d4e5f60701';
const REC = '64b7f0c2a1b2c3d4e5f60702';
const ATT = '64b7f0c2a1b2c3d4e5f60703';
const MSG = '64b7f0c2a1b2c3d4e5f60704';
const CONV = '64b7f0c2a1b2c3d4e5f60705';
const ALICE = '64b7f0c2a1b2c3d4e5f607a1';
const BOB = '64b7f0c2a1b2c3d4e5f607b2';

const world = (overrides: { recording?: Row; attachment?: Row; bubble?: boolean } = {}) => ({
  callRecording: table([
    {
      id: REC, callSessionId: CALL, requesterId: ALICE, requiredUserIds: [BOB], consentedUserIds: [BOB],
      requestedAt: new Date(0), startedAt: new Date(1), stoppedAt: null, stopReason: null, attachmentId: null,
      ...overrides.recording,
    },
  ]),
  messageAttachment: table([{ id: ATT, uploadedBy: ALICE, messageId: null, mimeType: 'audio/webm', ...overrides.attachment }]),
  callSession: table([{ id: CALL, conversationId: CONV }]),
  message: table(overrides.bubble === false ? [] : [{ id: MSG, conversationId: CONV, clientMessageId: callSummaryClientMessageId(CALL) }]),
  user: table([
    { id: ALICE, username: 'alice', displayName: 'Alice', avatar: null, systemLanguage: 'fr' },
    { id: BOB, username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'en' },
  ]),
  conversation: table([{ id: CONV, title: null, type: 'direct' }]),
});

const harness = (prisma: ReturnType<typeof world>) => {
  const handlers: Array<(req: unknown, reply: unknown) => Promise<unknown>> = [];
  const fastify = { post: (_path: string, _opts: unknown, handler: (req: unknown, reply: unknown) => Promise<unknown>) => handlers.push(handler) };
  const broadcastEdited = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const createNotification = jest.fn(async (_input: { userId: string; type: string; content: string }) => ({ id: 'n1' }));
  registerCallsRecordingRoutes(fastify as never, {
    prisma: prisma as never,
    callService: {} as never,
    requiredAuth: jest.fn() as never,
    broadcastEdited: broadcastEdited as never,
    notifications: { createNotification: createNotification as never },
    now: () => new Date(5),
  });
  const call = async (userId: string | undefined, attachmentId = ATT) => {
    const reply: { statusCode: number; body: unknown; status: (c: number) => unknown; send: (b: unknown) => unknown } = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      send(body: unknown) { this.body = body; return this; },
    };
    await handlers[0]?.(
      { params: { callId: CALL, recordingId: REC }, body: { attachmentId }, authContext: userId ? { type: 'user', userId } : { type: 'anonymous', userId: 'p1' } },
      reply,
    );
    await new Promise((resolve) => setImmediate(resolve));
    return reply;
  };
  return { call, broadcastEdited, createNotification };
};

describe('POST /calls/:callId/recordings/:recordingId/attachment — le fichier rejoint la bulle d’appel (#8064)', () => {
  it('l’enregistreur rattache son fichier audio à la bulle, qui est rediffusée, et les consentants sont prévenus', async () => {
    const prisma = world();
    const h = harness(prisma);
    const reply = await h.call(ALICE);

    expect(reply.body).toMatchObject({ success: true, data: { recordingId: REC, messageId: MSG, attachmentId: ATT } });
    expect(prisma.messageAttachment.state.rows[0]).toMatchObject({ messageId: MSG });
    expect(prisma.callRecording.state.rows[0]).toMatchObject({ attachmentId: ATT, stopReason: 'call-ended' });
    expect(h.broadcastEdited).toHaveBeenCalledWith(expect.objectContaining({ id: MSG }), CONV);
    expect(h.createNotification).toHaveBeenCalledTimes(1);
    expect(h.createNotification.mock.calls[0]?.[0]).toMatchObject({
      userId: BOB,
      type: 'call_recording_ready',
      content: '🎙️ The call recording is ready to play',
    });
  });

  it('un autre participant ne peut pas lier de fichier', async () => {
    const reply = await harness(world()).call(BOB);
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toMatchObject({ success: false, code: 'NOT_THE_RECORDER' });
  });

  it('un invité sans compte n’atteint rien', async () => {
    const reply = await harness(world()).call(undefined);
    expect(reply.statusCode).toBe(401);
  });

  it('un enregistrement jamais démarré (consentement incomplet) ne reçoit aucun fichier', async () => {
    const prisma = world({ recording: { startedAt: null, stoppedAt: new Date(2), stopReason: 'refused' } });
    const reply = await harness(prisma).call(ALICE);
    expect(reply.statusCode).toBe(409);
    expect(reply.body).toMatchObject({ code: 'RECORDING_NEVER_STARTED' });
    expect(prisma.messageAttachment.state.rows[0]).toMatchObject({ messageId: null });
  });

  it('un fichier d’un autre utilisateur répond introuvable, sans rien toucher', async () => {
    const prisma = world({ attachment: { uploadedBy: BOB } });
    const reply = await harness(prisma).call(ALICE);
    expect(reply.statusCode).toBe(404);
    expect(reply.body).toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
    expect(prisma.callRecording.state.rows[0]).toMatchObject({ attachmentId: null });
  });

  it('un fichier déjà dans un message, ou qui n’est pas de l’audio, est refusé', async () => {
    const attached = await harness(world({ attachment: { messageId: 'other' } })).call(ALICE);
    expect(attached.body).toMatchObject({ code: 'ATTACHMENT_ALREADY_ATTACHED' });

    const image = await harness(world({ attachment: { mimeType: 'image/png' } })).call(ALICE);
    expect(image.statusCode).toBe(415);
  });

  it('un enregistrement se lie une seule fois', async () => {
    const prisma = world();
    const h = harness(prisma);
    await h.call(ALICE);
    const second = await h.call(ALICE);
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ code: 'RECORDING_ALREADY_LINKED' });
  });

  it('sans bulle d’appel, le fichier reste libre', async () => {
    const prisma = world({ bubble: false });
    const reply = await harness(prisma).call(ALICE);
    expect(reply.body).toMatchObject({ code: 'CALL_BUBBLE_MISSING' });
    expect(prisma.callRecording.state.rows[0]).toMatchObject({ attachmentId: null });
  });
});
