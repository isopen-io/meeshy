/**
 * #17142 — les routes du talkie réveillé : la voix gardée, lisible sans socket par le
 * destinataire seul (capacité signée du push, ou jeton de session), et le jeton
 * PushToTalk enregistré dans le modèle de jetons existant (`type: 'pushtotalk'`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ ...(jest.requireActual('../../../../utils/logger') as object), logError: jest.fn() }));

import Fastify from 'fastify';
import { talkieRoutes } from '../../../../routes/talkie';
import { registerProcessTalkieRelay } from '../../../../services/talkie/talkieCut';
import { talkieAudioUrl, verifyTalkieAudioToken } from '../../../../services/talkie/talkieAudioToken';
import { TalkieRelay } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';
const INTRUS = '507f1f77bcf86cd799439033';

function relay(): TalkieRelay {
  return new TalkieRelay({
    io: { to: () => ({ emit: () => undefined }) } as never,
    judge: async (): Promise<TalkieVerdict> => ({ ok: true, delivery: 'waking', channel: 'push' }),
    withinStartRate: async () => true,
    cutAt: async () => null,
    now: () => Date.now(),
    report: () => undefined,
  });
}

function prismaDouble() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    pushToken: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => {
        rows.push(args.create);
        return { id: 'tok-1', type: args.create.type };
      }),
      deleteMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
    },
  };
}

async function app(prisma = prismaDouble()) {
  const a = Fastify();
  a.decorate('prisma', prisma as never);
  a.decorate('authenticate', async (request: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
    const user = request.headers['x-user'];
    if (typeof user !== 'string') return reply.code(401).send({ success: false, error: 'auth' });
    Object.assign(request, { authContext: { isAuthenticated: true, userId: user, registeredUser: { id: user }, sessionId: 'sess-1' } });
  });
  await a.register(talkieRoutes, { prefix: '/api/v1' });
  return { a, prisma };
}

async function waking(r: TalkieRelay) {
  const ack = await r.start('s-from', FROM, { toUserId: TO, codec: 'aac-adts' });
  if (!ack.success) throw new Error('refus');
  await r.chunk('s-from', FROM, { talkieId: ack.data.talkieId, seq: 0, data: new Uint8Array([1, 2, 3]) });
  await r.chunk('s-from', FROM, { talkieId: ack.data.talkieId, seq: 1, data: new Uint8Array([4, 5]) });
  return ack.data.talkieId;
}

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

let current: TalkieRelay;
beforeEach(() => { current = relay(); registerProcessTalkieRelay(current); });
afterEach(() => { current.dispose(); registerProcessTalkieRelay(null); });

describe('#17142 — GET /talkie/:talkieId/audio', () => {
  it('la capacité signée du push rend les fragments concaténés en audio/aac, sans jeton de session', async () => {
    const { a } = await app();
    const talkieId = await waking(current);
    const url = talkieAudioUrl({ talkieId, toUserId: TO, expiresAt: new Date(Date.now() + 60_000) });

    const res = await a.inject({ method: 'GET', url: pathOf(url) });
    await a.close();

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/aac');
    expect(res.headers['cache-control']).toContain('no-store');
    expect([...res.rawPayload]).toEqual([1, 2, 3, 4, 5]);
  });

  it('le destinataire authentifié lit aussi ; un autre compte, non (404, comme une voix inconnue)', async () => {
    const { a } = await app();
    const talkieId = await waking(current);

    const mine = await a.inject({ method: 'GET', url: `/api/v1/talkie/${talkieId}/audio`, headers: { 'x-user': TO } });
    const other = await a.inject({ method: 'GET', url: `/api/v1/talkie/${talkieId}/audio`, headers: { 'x-user': INTRUS } });
    const sender = await a.inject({ method: 'GET', url: `/api/v1/talkie/${talkieId}/audio`, headers: { 'x-user': FROM } });
    const unknown = await a.inject({ method: 'GET', url: `/api/v1/talkie/${'f'.repeat(24)}/audio`, headers: { 'x-user': TO } });
    const anonymous = await a.inject({ method: 'GET', url: `/api/v1/talkie/${talkieId}/audio` });
    await a.close();

    expect(mine.statusCode).toBe(200);
    expect([other.statusCode, sender.statusCode, unknown.statusCode]).toEqual([404, 404, 404]);
    expect(anonymous.statusCode).toBe(401);
  });

  it('une capacité expirée, falsifiée, ou signée pour un autre destinataire : 404', async () => {
    const { a } = await app();
    const talkieId = await waking(current);
    const expired = talkieAudioUrl({ talkieId, toUserId: TO, expiresAt: new Date(Date.now() - 1_000) });
    const forOther = talkieAudioUrl({ talkieId, toUserId: INTRUS, expiresAt: new Date(Date.now() + 60_000) });
    const valid = pathOf(talkieAudioUrl({ talkieId, toUserId: TO, expiresAt: new Date(Date.now() + 60_000) }));
    const forged = valid.replace(/t=[^&]+/, 't=AAAA');

    const codes = await Promise.all([expired, forOther].map((u) => a.inject({ method: 'GET', url: pathOf(u) })).concat(a.inject({ method: 'GET', url: forged })));
    await a.close();

    expect(codes.map((r) => r.statusCode)).toEqual([404, 404, 404]);
  });
});

describe('#17142 — la capacité de lecture', () => {
  it('est liée au talkie, au destinataire et à l’échéance', () => {
    const talkieId = 'a'.repeat(24);
    const url = talkieAudioUrl({ talkieId, toUserId: TO, expiresAt: new Date(Date.now() + 60_000) });
    const params = new URL(url).searchParams;
    const check = (over: Partial<Parameters<typeof verifyTalkieAudioToken>[0]>) =>
      verifyTalkieAudioToken({ talkieId, toUserId: TO, expiresAt: params.get('e') ?? undefined, token: params.get('t') ?? undefined, now: new Date(), ...over });

    expect(check({})).toBe(true);
    expect(check({ talkieId: 'b'.repeat(24) })).toBe(false);
    expect(check({ toUserId: INTRUS })).toBe(false);
    expect(check({ expiresAt: String(Number(params.get('e')) + 1) })).toBe(false);
    expect(check({ now: new Date(Date.now() + 120_000) })).toBe(false);
  });
});

describe('#17142 — le jeton PushToTalk', () => {
  it('POST enregistre un jeton pushtotalk iOS dans le modèle existant, RATTACHÉ à la session appelante, et le retire à tout autre compte', async () => {
    const { a, prisma } = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/users/me/push-to-talk-token', headers: { 'x-user': TO }, payload: { token: 'ptt-token-0123456789', apnsEnvironment: 'development' } });
    await a.close();

    expect(res.statusCode).toBe(200);
    expect(prisma.rows[0]).toMatchObject({ userId: TO, token: 'ptt-token-0123456789', type: 'pushtotalk', platform: 'ios', apnsEnvironment: 'development', isActive: true, sessionId: 'sess-1' });
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'ptt-token-0123456789', type: 'pushtotalk', userId: { not: TO } } });
  });

  it('POST sans jeton lisible : 400 ; sans session : 401', async () => {
    const { a } = await app();
    const bad = await a.inject({ method: 'POST', url: '/api/v1/users/me/push-to-talk-token', headers: { 'x-user': TO }, payload: { token: 'x' } });
    const anon = await a.inject({ method: 'POST', url: '/api/v1/users/me/push-to-talk-token', payload: { token: 'ptt-token-0123456789' } });
    await a.close();

    expect(bad.statusCode).toBe(400);
    expect(anon.statusCode).toBe(401);
  });

  it('DELETE retire MES jetons pushtotalk seulement', async () => {
    const { a, prisma } = await app();
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/users/me/push-to-talk-token', headers: { 'x-user': TO }, payload: { token: 'ptt-token-0123456789' } });
    await a.close();

    expect(res.statusCode).toBe(200);
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: TO, type: 'pushtotalk', token: 'ptt-token-0123456789' } });
  });
});
