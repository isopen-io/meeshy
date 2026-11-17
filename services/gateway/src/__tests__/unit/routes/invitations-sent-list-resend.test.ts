/**
 * Mes invitations envoyées et leur relance (#19207, chantier #18857).
 *
 * - `GET /invitations/email` liste MES invitations : adresse masquée côté serveur, état
 *   `sent | opened | joined` lu sur le jeton dédié (jamais un pixel), droits de relance.
 * - `POST /invitations/email/:id/resend` relance, une fois par 72 h, trois fois au plus ;
 *   refusée si l'adresse a rejoint Meeshy ou s'est désinscrite.
 * - `POST /invitations/email/opt-out` : l'invité refuse toute nouvelle invitation, et le
 *   serveur n'en garde qu'une empreinte.
 * - L'ancien client de `POST /invitations/email` lit la même réponse qu'avant.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({
  ...(jest.requireActual('../../../utils/logger') as object),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

import { invitationRoutes } from '../../../routes/invitations';
import { invitationOptOutHash, invitationOptOutUrl } from '../../../services/referrals/emailInvitations';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439099';
const INVITATION_ID = '64b7f1f77bcf86cd79943901';
const NOW = new Date('2026-11-17T12:00:00.000Z');
const HOUR = 3_600_000;

type InvitationRow = {
  id: string;
  senderId: string;
  email: string;
  sentAt: Date;
  resendCount: number | null;
  lastResentAt: Date | null;
  affiliateToken: { token: string; clickCount: number; currentUses: number; _count: { affiliations: number } };
};

const invitation = (overrides: Partial<InvitationRow> = {}): InvitationRow => ({
  id: INVITATION_ID,
  senderId: USER_ID,
  email: 'marie.dupont@gmail.com',
  sentAt: new Date(NOW.getTime() - 4 * 24 * HOUR),
  resendCount: null,
  lastResentAt: null,
  affiliateToken: { token: 'aff_invite1', clickCount: 0, currentUses: 0, _count: { affiliations: 0 } },
  ...overrides,
});

type Store = {
  rows: InvitationRow[];
  registeredEmails: string[];
  optedOutHashes: string[];
};

function makePrisma(store: Store) {
  const own = (where: { senderId?: string; id?: string }) =>
    store.rows.filter((row) => (where.senderId === undefined || row.senderId === where.senderId) && (where.id === undefined || row.id === where.id));
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice', avatar: null, systemLanguage: 'fr' }),
      findFirst: jest.fn<any>().mockImplementation(async (args: { where: { email: string } }) =>
        store.registeredEmails.includes(args.where.email) ? { id: 'someone' } : null),
      findMany: jest.fn<any>().mockImplementation(async (args: { where: { email: { in: string[] } } }) =>
        store.registeredEmails.filter((email) => args.where.email.in.includes(email)).map((email) => ({ email }))),
    },
    affiliateToken: {
      findUnique: jest.fn<any>().mockImplementation(async (args: { where: { token: string }; select?: unknown }) => {
        const row = store.rows.find((r) => r.affiliateToken.token === args.where.token);
        if (!args.select) return null;
        return row ? { emailInvitations: [{ email: row.email }] } : null;
      }),
      create: jest.fn<any>().mockResolvedValue({ id: 'affiliate-token-id', token: 'aff_new' }),
    },
    emailInvitation: {
      create: jest.fn<any>().mockResolvedValue({ id: 'email-invitation-id' }),
      count: jest.fn<any>().mockImplementation(async (args: { where: { senderId: string } }) => own(args.where).length),
      findMany: jest.fn<any>().mockImplementation(async (args: { where: { senderId: string }; skip?: number; take?: number }) =>
        own(args.where).slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 1000))),
      findFirst: jest.fn<any>().mockImplementation(async (args: { where: { id: string; senderId: string } }) => own(args.where)[0] ?? null),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    emailInvitationOptOut: {
      findUnique: jest.fn<any>().mockImplementation(async (args: { where: { emailHash: string } }) =>
        store.optedOutHashes.includes(args.where.emailHash) ? { id: 'opt' } : null),
      findMany: jest.fn<any>().mockImplementation(async (args: { where: { emailHash: { in: string[] } } }) =>
        store.optedOutHashes.filter((hash) => args.where.emailHash.in.includes(hash)).map((emailHash) => ({ emailHash }))),
      create: jest.fn<any>().mockResolvedValue({ id: 'opt' }),
    },
  };
}

async function buildApp(store: Store, options: { withEmailService?: boolean } = {}) {
  const prisma = makePrisma(store);
  const sendInvitationEmail = jest.fn<any>().mockResolvedValue(undefined);
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown);
  app.decorate('authenticate', async (req: Parameters<typeof app.authenticate>[0]) => {
    (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
    (req as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, emailVerifiedAt: new Date() },
    };
  });
  if (options.withEmailService !== false) {
    (app as unknown as Record<string, unknown>).emailService = { sendInvitationEmail };
  }
  await app.register(invitationRoutes);
  await app.ready();
  return { app, prisma, sendInvitationEmail };
}

const store = (overrides: Partial<Store> = {}): Store => ({ rows: [invitation()], registeredEmails: [], optedOutHashes: [], ...overrides });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GET /invitations/email — mes invitations envoyées', () => {
  it('masque l’adresse côté serveur : jamais l’adresse complète sur le fil', async () => {
    const { app } = await buildApp(store());
    const res = await app.inject({ method: 'GET', url: '/invitations/email' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('marie.dupont');
    expect(res.body).not.toContain('aff_invite1');
    const [item] = res.json().data;
    expect(item).toMatchObject({ id: INVITATION_ID, maskedEmail: 'ma•••••@gmail.com', state: 'sent', sentAt: '2026-11-13T12:00:00.000Z' });
    expect(item.email).toBeUndefined();
    expect(res.json().pagination).toMatchObject({ total: 1, offset: 0 });
  });

  it('ne liste que les invitations de l’appelant', async () => {
    const { app, prisma } = await buildApp(store({ rows: [invitation(), invitation({ id: 'other', senderId: OTHER_ID })] }));
    const res = await app.inject({ method: 'GET', url: '/invitations/email' });
    await app.close();

    expect(res.json().data.map((i: { id: string }) => i.id)).toEqual([INVITATION_ID]);
    expect(prisma.emailInvitation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { senderId: USER_ID }, take: expect.any(Number) }));
  });

  it('lit l’ouverture sur une visite du jeton dédié, et l’inscription sur son usage ou un compte existant', async () => {
    const rows = [
      invitation({ id: 'opened', affiliateToken: { token: 't1', clickCount: 2, currentUses: 0, _count: { affiliations: 0 } } }),
      invitation({ id: 'joined-by-link', affiliateToken: { token: 't2', clickCount: 1, currentUses: 1, _count: { affiliations: 1 } } }),
      invitation({ id: 'joined-elsewhere', email: 'deja@meeshy.me', affiliateToken: { token: 't3', clickCount: 0, currentUses: 0, _count: { affiliations: 0 } } }),
    ];
    const { app } = await buildApp(store({ rows, registeredEmails: ['deja@meeshy.me'] }));
    const res = await app.inject({ method: 'GET', url: '/invitations/email' });
    await app.close();

    const stateOf = (id: string) => res.json().data.find((i: { id: string }) => i.id === id);
    expect(stateOf('opened').state).toBe('opened');
    expect(stateOf('joined-by-link').state).toBe('joined');
    expect(stateOf('joined-elsewhere').state).toBe('joined');
    expect(stateOf('joined-elsewhere').canResend).toBe(false);
  });

  it('dit si la relance est possible, combien il en reste et quand, sans dire pourquoi une adresse est refusée', async () => {
    const rows = [
      invitation({ id: 'ready' }),
      invitation({ id: 'opted', email: 'non@merci.fr' }),
      invitation({ id: 'soon', sentAt: new Date(NOW.getTime() - 10 * HOUR) }),
    ];
    const { app } = await buildApp(store({ rows, optedOutHashes: [invitationOptOutHash('non@merci.fr')] }));
    const res = await app.inject({ method: 'GET', url: '/invitations/email' });
    await app.close();

    const of = (id: string) => res.json().data.find((i: { id: string }) => i.id === id);
    expect(of('ready')).toMatchObject({ canResend: true, resendsLeft: 3 });
    expect(of('opted')).toMatchObject({ canResend: false, state: 'sent', nextResendAt: null });
    expect(of('soon')).toMatchObject({ canResend: false, nextResendAt: '2026-11-20T02:00:00.000Z' });
    expect(res.body).not.toMatch(/optedOut|unsubscribed/);
  });
});

describe('POST /invitations/email/:id/resend — une relance par 72 h, trois au plus', () => {
  it('renvoie l’e-mail avec le lien du même jeton et compte la relance', async () => {
    const { app, prisma, sendInvitationEmail } = await buildApp(store());
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('marie.dupont');
    expect(res.json().data).toMatchObject({ id: INVITATION_ID, maskedEmail: 'ma•••••@gmail.com', resendsLeft: 2, canResend: false });
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'marie.dupont@gmail.com', downloadUrl: expect.stringMatching(/\/signup\/affiliate\/aff_invite1$/) }));
    expect(prisma.emailInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: INVITATION_ID, senderId: USER_ID }),
      data: { resendCount: 1, lastResentAt: NOW },
    }));
  });

  it('refuse avant 72 h, avec la date de la prochaine relance', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ rows: [invitation({ sentAt: new Date(NOW.getTime() - 71 * HOUR) })] }));
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ success: false, code: 'INVITATION_RESEND_TOO_SOON' });
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('refuse après la troisième relance', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ rows: [invitation({ resendCount: 3, lastResentAt: new Date(NOW.getTime() - 30 * 24 * HOUR) })] }));
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('INVITATION_RESEND_EXHAUSTED');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('refuse une adresse qui a rejoint Meeshy', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ registeredEmails: ['marie.dupont@gmail.com'] }));
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INVITATION_ALREADY_JOINED');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('refuse une adresse désinscrite', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ optedOutHashes: [invitationOptOutHash('Marie.Dupont@gmail.com')] }));
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INVITATION_OPTED_OUT');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('ne relance pas l’invitation d’un autre', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ rows: [invitation({ senderId: OTHER_ID })] }));
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('ne compte rien quand une relance concurrente a déjà pris la place', async () => {
    const { app, prisma, sendInvitationEmail } = await buildApp(store());
    prisma.emailInvitation.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(429);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('ne consomme pas de relance quand aucun e-mail ne peut partir', async () => {
    const { app, prisma } = await buildApp(store(), { withEmailService: false });
    const res = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(prisma.emailInvitation.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /invitations/email/opt-out — l’invité ne veut plus d’invitation', () => {
  const linkOf = (email: string) => {
    const url = new URL(invitationOptOutUrl(email));
    return { address: url.searchParams.get('address'), key: url.searchParams.get('key') };
  };

  it('garde l’empreinte de l’adresse, jamais l’adresse', async () => {
    const { app, prisma } = await buildApp(store());
    const res = await app.inject({ method: 'POST', url: '/invitations/email/opt-out', payload: linkOf('marie.dupont@gmail.com') });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ optedOut: true });
    expect(res.body).not.toContain('marie');
    expect(prisma.emailInvitationOptOut.create).toHaveBeenCalledWith({ data: { emailHash: invitationOptOutHash('marie.dupont@gmail.com') } });
    expect(JSON.stringify(prisma.emailInvitationOptOut.create.mock.calls)).not.toContain('marie');
  });

  it('est idempotent', async () => {
    const { app, prisma } = await buildApp(store());
    prisma.emailInvitationOptOut.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }) as never);
    const res = await app.inject({ method: 'POST', url: '/invitations/email/opt-out', payload: linkOf('marie.dupont@gmail.com') });
    await app.close();

    expect(res.statusCode).toBe(200);
  });

  it('le jeton du lien d’inscription, que le parrain détient, ne désinscrit personne', async () => {
    const { app, prisma } = await buildApp(store());
    const res = await app.inject({ method: 'POST', url: '/invitations/email/opt-out', payload: { token: 'aff_invite1' } });
    await app.close();

    expect(res.statusCode).not.toBe(200);
    expect(prisma.emailInvitationOptOut.create).not.toHaveBeenCalled();
  });

  it('refuse une clé qui n’est pas celle de l’adresse', async () => {
    const { app, prisma } = await buildApp(store());
    const forged = { address: invitationOptOutHash('marie.dupont@gmail.com'), key: linkOf('autre@gmail.com').key };
    const res = await app.inject({ method: 'POST', url: '/invitations/email/opt-out', payload: forged });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(prisma.emailInvitationOptOut.create).not.toHaveBeenCalled();
  });

  it('le lien part dans l’e-mail de l’invité, à l’envoi comme à la relance, jamais dans la réponse au parrain', async () => {
    const { app, sendInvitationEmail } = await buildApp(store());
    const sent = await app.inject({ method: 'POST', url: '/invitations/email', payload: { email: 'nouveau@example.com' } });
    const resent = await app.inject({ method: 'POST', url: `/invitations/email/${INVITATION_ID}/resend` });
    await app.close();

    expect(sendInvitationEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({ optOutUrl: invitationOptOutUrl('nouveau@example.com') }));
    expect(sendInvitationEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({ optOutUrl: invitationOptOutUrl('marie.dupont@gmail.com') }));
    const { key } = linkOf('nouveau@example.com');
    expect(sent.body).not.toContain(key);
    expect(resent.body).not.toContain(linkOf('marie.dupont@gmail.com').key);
  });
});

describe('POST /invitations/email — l’ancien chemin', () => {
  it('rend la même réponse qu’avant', async () => {
    const { app } = await buildApp(store());
    const res = await app.inject({ method: 'POST', url: '/invitations/email', payload: { email: 'nouveau@example.com' } });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(Object.keys(res.json().data).sort()).toEqual(['email', 'invitationUrl', 'sentAt']);
  });

  it('refuse une adresse désinscrite', async () => {
    const { app, sendInvitationEmail } = await buildApp(store({ optedOutHashes: [invitationOptOutHash('non@merci.fr')] }));
    const res = await app.inject({ method: 'POST', url: '/invitations/email', payload: { email: 'non@merci.fr' } });
    await app.close();

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INVITATION_OPTED_OUT');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});
