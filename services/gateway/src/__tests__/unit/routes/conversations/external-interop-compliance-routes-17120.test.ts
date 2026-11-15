/**
 * #17120 (chantier #17007) — les deux portes de conformité de l'interopérabilité :
 *
 *  - `GET` / `PUT /conversations/external/consent` : l'information sur ce qui
 *    part chez Meta (version, liste, durée de conservation) et le consentement
 *    DATÉ PAR LE SERVEUR, sous la version citée — une version périmée est
 *    refusée ; retirer le consentement efface les adresses que le compte gardait.
 *  - `POST /conversations/:id/external/report` : signaler un contenu reçu de
 *    WhatsApp — le signalant transmet LUI-MÊME ce qu'il veut (le clair du
 *    message s'il le choisit), le pair est bloqué localement, le serveur
 *    n'analyse rien, et la réponse oriente vers le mécanisme de Meta.
 *
 * Les deux sont derrière le drapeau `EXTERNAL_CONVERSATIONS`, éteint en production.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';
import {
  EXTERNAL_INTEROP_DISCLOSURES,
  EXTERNAL_INTEROP_NOTICE_VERSION,
  EXTERNAL_REPORT_ORIENTATION,
} from '@meeshy/shared/types/external-interop-compliance';
import { registerExternalComplianceRoutes } from '../../../../routes/conversations/external-compliance';

const ALICE = '507f1f77bcf86cd799439a01';
const CONVERSATION = '507f1f77bcf86cd799439c01';
const ARMED = { EXTERNAL_CONVERSATIONS: 'on', NODE_ENV: 'test' } as const;
const SECRET_TEXT = 'contenu-signale-fictif-42';

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;
type Logged = { readonly level: string; readonly args: readonly unknown[] };

const createFastify = (logged: Logged[]) => {
  const routes = new Map<string, Handler>();
  const record = (level: string) => (...args: unknown[]) => { logged.push({ level, args }); };
  const on = (method: string) => (path: string, _options: unknown, handler: Handler) => { routes.set(`${method} ${path}`, handler); };
  return {
    get: on('GET'),
    put: on('PUT'),
    post: on('POST'),
    log: { error: record('error'), warn: record('warn'), info: record('info'), debug: record('debug') },
    handler: (key: string): Handler => {
      const handler = routes.get(key);
      if (!handler) throw new Error(`route absente : ${key}`);
      return handler;
    },
  };
};

const createReply = () => {
  const reply: { body: unknown; statusCode: number; status: (code: number) => unknown; code: (code: number) => unknown; header: () => unknown; send: (body: unknown) => unknown } = {
    body: undefined,
    statusCode: 200,
    status: (code: number) => { reply.statusCode = code; return reply; },
    code: (code: number) => { reply.statusCode = code; return reply; },
    header: () => reply,
    send: (body: unknown) => { reply.body = body; return reply; },
  };
  return reply;
};

type World = {
  consentAt: Date | null;
  consentVersion: string | null;
  isExternalMember: boolean;
  hasPeer: boolean;
  userUpdates: Array<Record<string, unknown>>;
  peerUpdates: Array<Record<string, unknown>>;
  erasedFor: string[];
  reports: Array<Record<string, unknown>>;
};

const newWorld = (overrides: Partial<World> = {}): World => ({
  consentAt: null,
  consentVersion: null,
  isExternalMember: true,
  hasPeer: true,
  userUpdates: [],
  peerUpdates: [],
  erasedFor: [],
  reports: [],
  ...overrides,
});

const prismaFor = (world: World) => ({
  user: {
    findUnique: jest.fn(async () => ({
      id: ALICE,
      username: 'alice',
      whatsappInteropConsentAt: world.consentAt,
      whatsappInteropNoticeVersion: world.consentVersion,
    })),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      world.userUpdates.push(data);
      world.consentAt = (data.whatsappInteropConsentAt as Date | null) ?? null;
      world.consentVersion = (data.whatsappInteropNoticeVersion as string | null) ?? null;
      return { whatsappInteropConsentAt: world.consentAt, whatsappInteropNoticeVersion: world.consentVersion };
    }),
  },
  conversation: {
    findFirst: jest.fn(async () => (world.isExternalMember ? { id: CONVERSATION } : null)),
  },
  externalConversationPeer: {
    deleteMany: jest.fn(async ({ where }: { where: { openedByUserId?: string } }) => {
      if (where.openedByUserId) world.erasedFor.push(where.openedByUserId);
      return { count: 2 };
    }),
    updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      world.peerUpdates.push(data);
      return { count: world.hasPeer ? 1 : 0 };
    }),
  },
});

const asUser = { authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: ALICE, registeredUser: { id: ALICE, username: 'alice', role: 'ANALYST' } } };
const asGuest = { authContext: { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'guest', registeredUser: null } };

const call = async (params: {
  readonly route: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly world?: World;
  readonly body?: unknown;
  readonly query?: unknown;
  readonly as?: Record<string, unknown>;
}) => {
  const logged: Logged[] = [];
  const fastify = createFastify(logged);
  const world = params.world ?? newWorld();
  const prisma = prismaFor(world);
  const createReport = jest.fn(async (input: Record<string, unknown>) => {
    world.reports.push(input);
    return { id: 'report-1', status: 'pending', createdAt: new Date('2026-11-10T09:00:00Z') };
  });
  registerExternalComplianceRoutes(fastify as never, prisma as never, jest.fn() as never, {
    env: params.env ?? { ...ARMED, EXTERNAL_PEER_HANDLE_RETENTION_DAYS: '45' },
    now: () => new Date('2026-11-10T09:00:00Z'),
    createReport: createReport as never,
  });
  const reply = createReply();
  await fastify.handler(params.route)(
    { ...(params.as ?? asUser), body: params.body, query: params.query ?? {}, params: { id: CONVERSATION }, headers: {} },
    reply,
  );
  return { status: reply.statusCode, body: reply.body as Record<string, unknown>, world, prisma, logged, createReport };
};

describe('GET /conversations/external/consent', () => {
  it('drapeau éteint : 403 EXTERNAL_CONVERSATIONS_DISABLED, rien n’est lu', async () => {
    const res = await call({ route: 'GET /conversations/external/consent', env: { NODE_ENV: 'production', EXTERNAL_CONVERSATIONS: 'on' } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
    expect(res.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sert l’information en vigueur : version, ce qui part chez Meta, durée de conservation configurée, et l’absence de consentement', async () => {
    const res = await call({ route: 'GET /conversations/external/consent', query: { network: 'whatsapp' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        network: 'whatsapp',
        noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION,
        disclosures: [...EXTERNAL_INTEROP_DISCLOSURES],
        retentionDays: 45,
        consent: null,
        current: false,
      },
    });
  });

  it('un consentement sous une version périmée est servi, mais n’est pas « en vigueur »', async () => {
    const world = newWorld({ consentAt: new Date('2026-11-01T00:00:00Z'), consentVersion: '2026-01-01' });

    const res = await call({ route: 'GET /conversations/external/consent', query: { network: 'whatsapp' }, world });

    expect(res.body).toMatchObject({ data: { consent: { noticeVersion: '2026-01-01' }, current: false } });
  });

  it('un invité sans compte : 401', async () => {
    const res = await call({ route: 'GET /conversations/external/consent', as: asGuest });

    expect(res.status).toBe(401);
  });
});

describe('PUT /conversations/external/consent', () => {
  it('consentir sous la version en vigueur : la date est celle du SERVEUR, la version est gravée', async () => {
    const res = await call({
      route: 'PUT /conversations/external/consent',
      body: { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted: true },
    });

    expect(res.status).toBe(200);
    expect(res.world.userUpdates).toEqual([
      { whatsappInteropConsentAt: new Date('2026-11-10T09:00:00Z'), whatsappInteropNoticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION },
    ]);
    expect(res.body).toMatchObject({ data: { current: true, consent: { noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION } } });
  });

  it('une version citée qui n’est plus en vigueur : 409, rien n’est écrit', async () => {
    const res = await call({
      route: 'PUT /conversations/external/consent',
      body: { network: 'whatsapp', noticeVersion: '2026-01-01', granted: true },
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: EXTERNAL_CONVERSATION_ERROR_CODES.NOTICE_OUTDATED });
    expect(res.world.userUpdates).toHaveLength(0);
  });

  it.each([
    ['une date fournie par le client', { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted: true, grantedAt: '2020-01-01' }],
    ['un réseau inconnu', { network: 'telegram', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted: true }],
    ['sans décision', { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION }],
  ])('%s : 400, rien n’est écrit', async (_label, body) => {
    const res = await call({ route: 'PUT /conversations/external/consent', body });

    expect(res.status).toBe(400);
    expect(res.world.userUpdates).toHaveLength(0);
  });

  it('retirer le consentement efface la date ET les adresses d’amis que le compte gardait', async () => {
    const world = newWorld({ consentAt: new Date('2026-11-01T00:00:00Z'), consentVersion: EXTERNAL_INTEROP_NOTICE_VERSION });

    const res = await call({
      route: 'PUT /conversations/external/consent',
      body: { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted: false },
      world,
    });

    expect(res.status).toBe(200);
    expect(res.world.userUpdates).toEqual([{ whatsappInteropConsentAt: null, whatsappInteropNoticeVersion: null }]);
    expect(res.world.erasedFor).toEqual([ALICE]);
    expect(res.body).toMatchObject({ data: { consent: null, current: false } });
  });

  it('retirer le consentement sous une version PÉRIMÉE (client pas encore mis à jour) efface quand même les adresses : le retrait n’est jamais bloqué par la version', async () => {
    const world = newWorld({ consentAt: new Date('2026-11-01T00:00:00Z'), consentVersion: EXTERNAL_INTEROP_NOTICE_VERSION });

    const res = await call({
      route: 'PUT /conversations/external/consent',
      body: { network: 'whatsapp', noticeVersion: '2026-01-01', granted: false },
      world,
    });

    expect(res.status).toBe(200);
    expect(res.world.userUpdates).toEqual([{ whatsappInteropConsentAt: null, whatsappInteropNoticeVersion: null }]);
    expect(res.world.erasedFor).toEqual([ALICE]);
    expect(res.body).toMatchObject({ data: { consent: null, current: false } });
  });
});

describe('POST /conversations/:id/external/report', () => {
  const route = 'POST /conversations/:id/external/report';

  it('drapeau éteint : 403, aucun signalement écrit', async () => {
    const res = await call({ route, env: { NODE_ENV: 'test' }, body: { reportType: 'harassment' } });

    expect(res.status).toBe(403);
    expect(res.createReport).not.toHaveBeenCalled();
  });

  it('signale, bloque le pair par défaut et oriente vers le mécanisme de Meta', async () => {
    const res = await call({ route, body: { reportType: 'harassment', disclosedText: SECRET_TEXT } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { reportId: 'report-1', peerBlocked: true, orientation: EXTERNAL_REPORT_ORIENTATION },
    });
    expect(res.world.reports).toEqual([
      expect.objectContaining({
        reportedType: 'conversation',
        reportedEntityId: CONVERSATION,
        reportType: 'harassment',
        reporterId: ALICE,
        reason: SECRET_TEXT,
      }),
    ]);
    expect(res.world.peerUpdates).toEqual([{ blockedAt: new Date('2026-11-10T09:00:00Z') }]);
  });

  it('le signalant peut ne RIEN transmettre du contenu, et ne pas bloquer', async () => {
    const res = await call({ route, body: { reportType: 'spam', blockPeer: false } });

    expect(res.status).toBe(201);
    expect(res.world.reports[0]).not.toHaveProperty('reason', expect.anything());
    expect(res.world.peerUpdates).toHaveLength(0);
    expect(res.body).toMatchObject({ data: { peerBlocked: false } });
  });

  it('le texte transmis ne va dans AUCUN journal ni dans la réponse', async () => {
    const res = await call({ route, body: { reportType: 'harassment', disclosedText: SECRET_TEXT } });

    expect(JSON.stringify(res.body)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(res.logged)).not.toContain(SECRET_TEXT);
  });

  it('une conversation qui n’est pas une conversation externe dont il est membre : 404, rien écrit', async () => {
    const res = await call({ route, body: { reportType: 'harassment' }, world: newWorld({ isExternalMember: false }) });

    expect(res.status).toBe(404);
    expect(res.createReport).not.toHaveBeenCalled();
    expect(res.world.peerUpdates).toHaveLength(0);
  });

  it('l’adresse du pair déjà purgée : le signalement passe, et la réponse dit qu’aucun pair n’a été bloqué', async () => {
    const res = await call({ route, body: { reportType: 'violence' }, world: newWorld({ hasPeer: false }) });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { peerBlocked: false } });
  });

  it.each([
    ['un type de signalement inconnu', { reportType: 'bad' }],
    ['un texte transmis trop long', { reportType: 'spam', disclosedText: 'x'.repeat(2001) }],
    ['un champ en trop', { reportType: 'spam', analyse: true }],
  ])('%s : 400', async (_label, body) => {
    const res = await call({ route, body });

    expect(res.status).toBe(400);
    expect(res.createReport).not.toHaveBeenCalled();
  });
});
