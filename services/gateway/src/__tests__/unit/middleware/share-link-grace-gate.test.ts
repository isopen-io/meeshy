/**
 * #9713 — CRÉER UN LIEN DE PARTAGE SUIT LE DÉLAI DE GRÂCE DE L'ADRESSE, AU
 * PLUS CINQ LIENS ACTIFS (décision porteur 2026-10-08).
 *
 * `requireShareLinkGrace` remplace, pour `POST /links` et
 * `POST /conversations/:id/new-link`, la garde stricte de #6437 :
 * - adresse prouvée ⇒ aucune limite ;
 * - adresse non prouvée, délai de grâce en cours ⇒ autorisé tant que
 *   l'utilisateur a MOINS de `UNVERIFIED_ACTIVE_SHARE_LINK_CAP` liens actifs ;
 * - délai échu (`blocked`) ou activation absente ⇒ 403 `EMAIL_NOT_VERIFIED`.
 *
 * Témoins par VRAIE requête (`app.inject()`), la garde montée comme sur les
 * routes réelles.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { EventEmitter } from 'events';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import type { AccountActivation } from '@meeshy/shared/types/account-activation';

import {
  requireShareLinkGrace,
  requireEmailVerification,
  UNVERIFIED_ACTIVE_SHARE_LINK_CAP,
  EMAIL_VERIFICATION_GATED_ROUTES,
  SHARE_LINK_GRACE_GATED_ROUTES,
} from '../../../middleware/verification-gates';
import { takeShareLinkTurn } from '../../../services/auth/share-link-grace';

const USER_ID = '507f1f77bcf86cd799439044';

type Caller = {
  readonly emailVerifiedAt: Date | null;
  readonly activation?: AccountActivation;
};

const graceCaller = (phase: AccountActivation['phase'] = 'invite'): Caller => ({
  emailVerifiedAt: null,
  activation: { phase, deadline: '2026-10-30T00:00:00.000Z', missing: ['email', 'phone'] },
});

type CountArgs = { readonly where: Record<string, unknown> };

function buildApp(opts: {
  readonly caller: Caller | null;
  readonly activeLinks: () => number;
  readonly handlerDelayMs?: number;
  readonly onCreate?: () => void;
}): { app: FastifyInstance; countCalls: CountArgs[] } {
  const countCalls: CountArgs[] = [];
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    conversationShareLink: {
      count: async (args: CountArgs) => {
        countCalls.push(args);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return opts.activeLinks();
      },
    },
  } as never);
  const fakeAuth = async (request: FastifyRequest): Promise<void> => {
    if (!opts.caller) return;
    (request as unknown as { authContext: unknown }).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', ...opts.caller },
    };
  };
  app.post('/links', { onRequest: [fakeAuth, requireShareLinkGrace] }, async () => {
    if (opts.handlerDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.handlerDelayMs));
    opts.onCreate?.();
    return { success: true };
  });
  app.post('/invitations/email', { onRequest: [fakeAuth, requireEmailVerification] }, async () => ({ success: true }));
  return { app, countCalls };
}

describe('requireShareLinkGrace — la loi (#9713)', () => {
  it('the cap is five active links', () => {
    expect(UNVERIFIED_ACTIVE_SHARE_LINK_CAP).toBe(5);
  });

  it('lets a verified address create links without any limit (and never counts)', async () => {
    const { app, countCalls } = buildApp({ caller: { emailVerifiedAt: new Date() }, activeLinks: () => 50 });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(countCalls).toHaveLength(0);
    await app.close();
  });

  it.each([0, 4])('lets an unproven address within its grace create a link with %i active links', async (active) => {
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: () => active });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('applies during the quiet phase too', async () => {
    const { app } = buildApp({ caller: graceCaller('quiet'), activeLinks: () => 0 });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it.each([5, 9])('refuses the next link with 403 EMAIL_NOT_VERIFIED once %i links are active', async (active) => {
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: () => active });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Email verification required to create more share links',
    });
    await app.close();
  });

  it('counts only the caller\'s links that are active and not expired', async () => {
    const { app, countCalls } = buildApp({ caller: graceCaller('invite'), activeLinks: () => 0 });
    const before = Date.now();
    await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(countCalls).toHaveLength(1);
    const where = countCalls[0].where as {
      createdBy: string; isActive: boolean; OR: ReadonlyArray<{ expiresAt: unknown }>;
    };
    expect(where.createdBy).toBe(USER_ID);
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual(expect.arrayContaining([
      { expiresAt: null },
      { expiresAt: { isSet: false } },
    ]));
    const future = where.OR.find((clause) => (clause.expiresAt as { gt?: Date })?.gt instanceof Date);
    expect((future?.expiresAt as { gt: Date }).gt.getTime()).toBeGreaterThanOrEqual(before);
    await app.close();
  });

  it('refuses an unproven address whose grace has run out (blocked) without counting', async () => {
    const { app, countCalls } = buildApp({ caller: graceCaller('blocked'), activeLinks: () => 0 });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED', error: 'Email verification required' });
    expect(countCalls).toHaveLength(0);
    await app.close();
  });

  it('fails closed when no activation is served for an unproven address', async () => {
    const { app } = buildApp({ caller: { emailVerifiedAt: null }, activeLinks: () => 0 });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });

  it('answers 401 UNAUTHORIZED without a session', async () => {
    const { app } = buildApp({ caller: null, activeLinks: () => 0 });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    await app.close();
  });
});

describe('requireShareLinkGrace — la course au cinquième lien', () => {
  const database = (initial: number) => {
    let rows = initial;
    return { count: () => rows, insert: () => { rows += 1; }, rows: () => rows };
  };

  it('lets only ONE of two simultaneous creations through when four links are active', async () => {
    const db = database(4);
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: db.count, onCreate: db.insert, handlerDelayMs: 20 });
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/links', payload: {} }),
      app.inject({ method: 'POST', url: '/links', payload: {} }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 403]);
    expect(db.rows()).toBe(5);
    await app.close();
  });

  it('never exceeds the cap under five simultaneous creations from an empty account', async () => {
    const db = database(0);
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: db.count, onCreate: db.insert, handlerDelayMs: 10 });
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => app.inject({ method: 'POST', url: '/links', payload: {} })),
    );
    expect(responses.filter((res) => res.statusCode === 200)).toHaveLength(5);
    expect(db.rows()).toBe(5);
    await app.close();
  });

  it('does not refuse the fifth link while the fourth is still being written (no double count)', async () => {
    const db = database(3);
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: db.count, onCreate: db.insert, handlerDelayMs: 20 });
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/links', payload: {} }),
      app.inject({ method: 'POST', url: '/links', payload: {} }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(db.rows()).toBe(5);
    await app.close();
  });

  it('gives the turn back once the response is sent — the next creation counts the database again', async () => {
    let active = 3;
    const { app } = buildApp({ caller: graceCaller('invite'), activeLinks: () => active });
    expect((await app.inject({ method: 'POST', url: '/links', payload: {} })).statusCode).toBe(200);
    active = 4;
    expect((await app.inject({ method: 'POST', url: '/links', payload: {} })).statusCode).toBe(200);
    active = 5;
    expect((await app.inject({ method: 'POST', url: '/links', payload: {} })).statusCode).toBe(403);
    active = 4;
    expect((await app.inject({ method: 'POST', url: '/links', payload: {} })).statusCode).toBe(200);
    await app.close();
  });
});

describe('les routes gardées (#9713)', () => {
  it('inviting by e-mail stays under the strict guard, grace or not', async () => {
    const { app } = buildApp({ caller: graceCaller('quiet'), activeLinks: () => 0 });
    const res = await app.inject({ method: 'POST', url: '/invitations/email', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });

  it('the two link routes leave the strict list for the grace list; inviting stays strict', () => {
    expect([...EMAIL_VERIFICATION_GATED_ROUTES]).toEqual(['POST /invitations/email']);
    expect([...SHARE_LINK_GRACE_GATED_ROUTES]).toEqual(['POST /links', 'POST /conversations/:id/new-link']);
  });
});

describe('requireShareLinkGrace — le tour et la réponse', () => {
  const graceRequest = (userId: string) => ({
    authContext: {
      isAuthenticated: true,
      registeredUser: { id: userId, ...graceCaller('invite') },
    },
    server: { prisma: { conversationShareLink: { count: async () => 0 } } },
  });

  const turnIsFree = async (userId: string): Promise<boolean> => {
    const taken = takeShareLinkTurn(userId).then((release) => {
      release();
      return true;
    });
    const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50));
    return Promise.race([taken, late]);
  };

  it('gives the turn back at once when the client left during the count (response already destroyed)', async () => {
    const userId = '507f1f77bcf86cd7994390a1';
    const raw = Object.assign(new EventEmitter(), { destroyed: true, writableFinished: false });
    await requireShareLinkGrace(graceRequest(userId) as never, { raw } as never);
    expect(raw.listenerCount('close')).toBe(0);
    expect(await turnIsFree(userId)).toBe(true);
  });

  it('holds the turn until the response closes', async () => {
    const userId = '507f1f77bcf86cd7994390a2';
    const raw = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
    await requireShareLinkGrace(graceRequest(userId) as never, { raw } as never);
    expect(raw.listenerCount('close')).toBe(1);
    expect(await turnIsFree(userId)).toBe(false);
    raw.emit('close');
    expect(await turnIsFree(userId)).toBe(true);
  });
});
