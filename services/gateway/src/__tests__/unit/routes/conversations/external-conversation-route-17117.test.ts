/**
 * #17117 — `POST /conversations/external` : ouvrir une conversation avec un ami
 * d'un réseau tiers. Drapeau éteint ⇒ refus stable ; numéro non vérifié ⇒ refus
 * stable ; un numéro ne revient jamais dans une réponse d'erreur ni dans un
 * journal, même quand Prisma le recopie dans son message d'erreur.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  EXTERNAL_CONVERSATION_ACTIVE_CAP,
  EXTERNAL_CONVERSATION_ERROR_CODES,
  EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR,
} from '@meeshy/shared/types/external-conversation';
import { EXTERNAL_INTEROP_NOTICE_VERSION } from '@meeshy/shared/types/external-interop-compliance';
import { registerExternalConversationRoute } from '../../../../routes/conversations/external';

const ALICE = '507f1f77bcf86cd799439a01';
const CONVERSATION = '507f1f77bcf86cd799439c01';
const FRIEND = '+33612345678';
const ARMED = { EXTERNAL_CONVERSATIONS: 'on', NODE_ENV: 'test' } as const;

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

type Logged = { readonly level: string; readonly args: readonly unknown[] };

const createFastify = (logged: Logged[]) => {
  const routes = new Map<string, Handler>();
  const record = (level: string) => (...args: unknown[]) => { logged.push({ level, args }); };
  return {
    post: (path: string, _options: unknown, handler: Handler) => { routes.set(`POST ${path}`, handler); },
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

type PrismaWorld = {
  phoneVerifiedAt: Date | null;
  role: string;
  existing: boolean;
  kept: number;
  failWith?: Error;
  creates: number;
  consentVersion?: string | null;
};

const prismaFor = (world: PrismaWorld) => ({
  user: {
    findUnique: jest.fn(async () => {
      const consentVersion = world.consentVersion === undefined ? EXTERNAL_INTEROP_NOTICE_VERSION : world.consentVersion;
      return {
        id: ALICE,
        phoneVerifiedAt: world.phoneVerifiedAt,
        displayName: 'Alice',
        username: 'alice',
        role: world.role,
        whatsappInteropConsentAt: consentVersion ? new Date('2026-11-09T00:00:00Z') : null,
        whatsappInteropNoticeVersion: consentVersion,
      };
    }),
  },
  externalConversationPeer: {
    findUnique: jest.fn(async () => {
      if (world.failWith) throw world.failWith;
      return world.existing ? { id: 'peer-0', conversationId: CONVERSATION } : null;
    }),
    update: jest.fn(async () => ({ id: 'peer-0' })),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => world.kept),
  },
  conversation: {
    findUnique: jest.fn(async () => ({ isActive: true, closedAt: null, participants: [{ id: 'p-0' }] })),
    create: jest.fn(async ({ data }: { data: { id: string } }) => { world.creates += 1; return { id: data.id }; }),
  },
});

const asUser = { authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: ALICE, registeredUser: { id: ALICE, role: 'USER' } } };
const asGuest = { authContext: { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'guest', registeredUser: null } };

const post = async (params: {
  readonly env?: Readonly<Record<string, string>>;
  readonly world?: Partial<PrismaWorld>;
  readonly body?: unknown;
  readonly as?: Record<string, unknown>;
}) => {
  const logged: Logged[] = [];
  const fastify = createFastify(logged);
  const world: PrismaWorld = { phoneVerifiedAt: new Date('2026-10-01T00:00:00Z'), role: 'ANALYST', existing: false, kept: 0, creates: 0, ...params.world };
  const prisma = prismaFor(world);
  registerExternalConversationRoute(fastify as never, prisma as never, jest.fn() as never, {
    env: params.env ?? ARMED,
    regime: { newConversationId: () => CONVERSATION, now: () => new Date('2026-11-10T09:00:00Z'), serverKeyIdFor: async () => 'never' },
  });
  const reply = createReply();
  await fastify.handler('POST /conversations/external')(
    { ...(params.as ?? asUser), body: params.body ?? { network: 'whatsapp', handle: FRIEND }, headers: {} },
    reply,
  );
  return { status: reply.statusCode, body: reply.body as Record<string, unknown>, world, prisma, logged };
};

describe('POST /conversations/external', () => {
  it('drapeau éteint (défaut) : 403 EXTERNAL_CONVERSATIONS_DISABLED, rien n’est lu ni créé', async () => {
    const res = await post({ env: { NODE_ENV: 'test' } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
    expect(res.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(res.world.creates).toBe(0);
  });

  it('drapeau armé en production : toujours éteint', async () => {
    const res = await post({ env: { EXTERNAL_CONVERSATIONS: 'on', NODE_ENV: 'production' } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
  });

  it('un invité sans compte ne l’ouvre pas', async () => {
    const res = await post({ as: asGuest });

    expect(res.status).toBe(401);
    expect(res.world.creates).toBe(0);
  });

  it.each([
    ['un numéro hors E.164', { network: 'whatsapp', handle: '0612345678' }],
    ['un réseau inconnu', { network: 'telegram', handle: FRIEND }],
    ['un nom posé à côté', { network: 'whatsapp', handle: FRIEND, name: 'Bob Martin' }],
  ])('%s : 400 EXTERNAL_CONVERSATION_INVALID, et la réponse ne recopie rien de la demande', async (_label, body) => {
    const res = await post({ body });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });
    const served = JSON.stringify(res.body);
    expect(served).not.toContain('612345678');
    expect(served).not.toContain('Bob Martin');
    expect(res.world.creates).toBe(0);
  });

  it('un utilisateur sans numéro vérifié : 403 EXTERNAL_CONVERSATION_PHONE_UNVERIFIED', async () => {
    const res = await post({ world: { phoneVerifiedAt: null } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED });
    expect(res.world.creates).toBe(0);
  });

  it.each([
    ['sans consentement enregistré', null],
    ['un consentement donné sous une information périmée', '2026-01-01'],
  ])('%s : 403 EXTERNAL_CONVERSATION_CONSENT_REQUIRED, rien créé (#17120)', async (_label, consentVersion) => {
    const res = await post({ world: { consentVersion } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.CONSENT_REQUIRED });
    expect(res.world.creates).toBe(0);
  });

  it('ouvre : 201, une conversation externe e2ee, et la réponse ne recopie pas le numéro', async () => {
    const res = await post({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { conversationId: CONVERSATION, type: 'external', encryptionMode: 'e2ee', network: 'whatsapp', created: true },
    });
    expect(JSON.stringify(res.body)).not.toContain('612345678');
  });

  it('rouvre : 200, la même conversation', async () => {
    const res = await post({ world: { existing: true } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { conversationId: CONVERSATION, created: false } });
    expect(res.world.creates).toBe(0);
  });

  it('une erreur de base qui recopie le numéro : 500 générique, et aucun journal ne le porte', async () => {
    const failWith = Object.assign(new Error(`Invalid \`prisma.externalConversationPeer.findUnique()\` handle: "${FRIEND}"`), { code: 'P2010' });

    const res = await post({ world: { failWith } });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('612345678');
    expect(res.logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.logged, (_key, value) => (value instanceof Error ? value.message : value))).not.toContain('612345678');
  });

  it(`au plafond de ${EXTERNAL_CONVERSATION_ACTIVE_CAP} adresses gardées : 409 EXTERNAL_CONVERSATION_LIMIT_REACHED, rien créé`, async () => {
    const res = await post({ world: { kept: EXTERNAL_CONVERSATION_ACTIVE_CAP } });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.LIMIT_REACHED });
    expect(res.world.creates).toBe(0);
  });

  it('un compte qui ne peut pas encore choisir le bout en bout : 403 EXTERNAL_CONVERSATION_END_TO_END_RESERVED', async () => {
    const res = await post({ world: { role: 'USER' } });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: EXTERNAL_CONVERSATION_ERROR_CODES.END_TO_END_RESERVED });
    expect(res.world.creates).toBe(0);
  });
});

describe('POST /conversations/external — débit par compte (audit du 2026-11-10)', () => {
  const app = async () => {
    const instance = Fastify({ logger: false });
    await instance.register(rateLimit, { global: false });
    const world: PrismaWorld = { phoneVerifiedAt: new Date('2026-10-01T00:00:00Z'), role: 'ANALYST', existing: true, kept: 0, creates: 0 };
    const auth = async (request: { headers: Record<string, unknown>; authContext?: unknown }) => {
      const userId = String(request.headers['x-test-user']);
      request.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role: 'ANALYST' } };
    };
    registerExternalConversationRoute(instance as never, prismaFor(world) as never, auth as never, {
      env: ARMED,
      regime: { newConversationId: () => CONVERSATION, now: () => new Date('2026-11-10T09:00:00Z'), serverKeyIdFor: async () => 'never' },
    });
    await instance.ready();
    return instance;
  };

  const open = (instance: Awaited<ReturnType<typeof app>>, user: string) =>
    instance.inject({ method: 'POST', url: '/conversations/external', headers: { 'x-test-user': user }, payload: { network: 'whatsapp', handle: FRIEND } });

  it(`au-delà de ${EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR} ouvertures par heure, le compte reçoit 429 ; un autre compte, non`, async () => {
    const instance = await app();
    try {
      const statuses = await Array.from({ length: EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR + 1 }).reduce<Promise<number[]>>(
        async (previous) => [...(await previous), (await open(instance, ALICE)).statusCode],
        Promise.resolve([]),
      );

      expect(statuses.slice(0, EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR).every((status) => status === 200)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
      expect((await open(instance, '507f1f77bcf86cd799439a02')).statusCode).toBe(200);
    } finally {
      await instance.close();
    }
  });
});
