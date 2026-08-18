/**
 * Un visiteur sans compte a une IDENTITÉ, et elle doit être consultable.
 *
 * Il a rempli un formulaire pour entrer — prénom, nom, parfois email et date de
 * naissance quand le lien les exigeait — et rien de tout cela n'était lisible
 * nulle part. Les autres membres ne voyaient qu'un pseudo, alors que la personne
 * avait explicitement fourni de quoi se présenter. Un participant sans fiche est
 * un participant qu'on ne peut ni reconnaître, ni modérer, ni accueillir.
 *
 * DEUX CERCLES, et la distinction est le cœur de cette route :
 *
 *   - l'IDENTITÉ (nom, pseudo, langue, date d'arrivée, lien emprunté) est
 *     visible de tout membre — c'est ce que la personne montre en entrant ;
 *   - les COORDONNÉES (email, date de naissance) ne le sont pas. Elles n'ont
 *     été demandées que parce que l'HÔTE a coché `requireEmail` /
 *     `requireBirthday` sur son lien : elles lui reviennent, à lui et à ses
 *     modérateurs, pas à la salle — laquelle contient d'autres visiteurs
 *     anonymes entrés par le même lien public.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockCanAccess = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: unknown[]) => mockCanAccess(...args),
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
  invalidateConversationIdCache: jest.fn(),
}));

import { registerParticipantsRoutes } from '../../../routes/conversations/participants';

const CONV_ID = '507f1f77bcf86cd799439022';
const VIEWER_ID = '507f1f77bcf86cd799439001';
const ANON_ID = '507f1f77bcf86cd799439033';

const anonymousRow = {
  id: ANON_ID,
  conversationId: CONV_ID,
  type: 'anonymous',
  userId: null,
  displayName: 'ano_bob_sm123',
  avatar: null,
  language: 'fr',
  role: 'member',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-08-18T10:00:00Z'),
  joinedAt: new Date('2026-08-18T09:00:00Z'),
  anonymousSession: {
    shareLinkId: 'link-1',
    session: { country: 'FR', connectedAt: new Date('2026-08-18T09:00:00Z') },
    profile: {
      firstName: 'Bob',
      lastName: 'Smith',
      username: 'ano_bob_sm123',
      email: 'bob@example.com',
      birthday: new Date('1990-05-02T00:00:00Z'),
    },
  },
  user: null,
};

type Ctx = ReturnType<typeof setup>;

function setup(viewerRole: string = 'member') {
  const routes: { method: string; path: string; handler: any }[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });

  const prisma = {
    participant: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        if (where?.id === ANON_ID) return anonymousRow;
        if (where?.userId === VIEWER_ID) return { id: 'viewer-row', role: viewerRole, type: 'user' };
        return null;
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: 'link-1', name: 'Invitation publique' }),
    },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'sys' }) },
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
  };

  const fastify = {
    get: register('GET'),
    post: register('POST'),
    patch: register('PATCH'),
    delete: register('DELETE'),
    put: register('PUT'),
    prisma,
    socketIOHandler: undefined,
  } as any;

  registerParticipantsRoutes(fastify, prisma as never, jest.fn(), jest.fn());

  const reply: any = { _body: undefined, _status: 200 };
  reply.status = jest.fn((code: number) => { reply._status = code; return reply; });
  reply.send = jest.fn((body: any) => { reply._body = body; return reply; });

  return { routes, prisma, reply };
}

function routeFor(ctx: Ctx, fragment: string) {
  const found = ctx.routes.find((r) => r.method === 'GET' && r.path.includes(fragment));
  if (!found) throw new Error(`route *${fragment}* absente`);
  return found;
}

async function fetchProfile(ctx: Ctx) {
  const route = routeFor(ctx, 'participants/:participantId/profile');
  await route.handler(
    {
      params: { id: CONV_ID, participantId: ANON_ID },
      authContext: { userId: VIEWER_ID, isAuthenticated: true, registeredUser: { id: VIEWER_ID } },
    },
    ctx.reply
  );
  return ctx.reply._body?.data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccess.mockResolvedValue(true);
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('GET /conversations/:id/participants/:participantId/profile — identité', () => {
  it('rend ce que le visiteur a montré en entrant', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data).toMatchObject({
      participantId: ANON_ID,
      isAnonymous: true,
      username: 'ano_bob_sm123',
      firstName: 'Bob',
      lastName: 'Smith',
      language: 'fr',
    });
  });

  it('date son arrivée et nomme le lien emprunté', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.joinedAt).toBeTruthy();
    expect(data.shareLinkName).toBe('Invitation publique');
  });

  it('refuse à qui n’est pas membre de la conversation', async () => {
    mockCanAccess.mockResolvedValue(false);
    const ctx = setup('member');

    await fetchProfile(ctx);

    expect(ctx.reply._status).toBe(403);
  });
});

describe('GET …/profile — les coordonnées ne sont pas publiques', () => {
  it('les cache à un membre ordinaire — la salle contient d’autres visiteurs', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.email).toBeNull();
    expect(data.birthday).toBeNull();
  });

  it('les rend à un modérateur — c’est l’hôte qui les a exigées', async () => {
    const data = await fetchProfile(setup('moderator'));

    expect(data.email).toBe('bob@example.com');
    expect(data.birthday).toBeTruthy();
  });

  it('les rend à un administrateur de la conversation', async () => {
    const data = await fetchProfile(setup('admin'));

    expect(data.email).toBe('bob@example.com');
  });

  // Le membre ordinaire doit SAVOIR que des coordonnées existent sans les
  // lire : sans ce drapeau, sa vue et celle d'un visiteur qui n'en a fourni
  // aucune sont identiques, et l'hôte ne peut pas distinguer les deux.
  it('dit qu’il en existe, sans les livrer', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.hasEmail).toBe(true);
    expect(data.hasBirthday).toBe(true);
  });
});
