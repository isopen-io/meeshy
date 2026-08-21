/**
 * L'hôte pilote les droits d'un visiteur, sans passer par son lien.
 *
 * Figer les conditions d'entrée au join lui a retiré un levier : décocher
 * `allowViewHistory` sur le lien ne referme plus rien à qui est déjà là. Cette
 * route est son remplaçant — et elle est plus fine, puisqu'elle vise UNE
 * personne au lieu de tous ceux qui ont emprunté le même lien.
 *
 * `AnonymousRightsOverride` existait dans le schéma, était LU par `auth.ts`, et
 * n'avait aucun écrivain nulle part. C'est son premier.
 *
 * La surcharge est un DELTA, jamais une copie : un droit que l'hôte ne touche
 * pas reste absent, donc continue de suivre la valeur du join. Recopier les huit
 * droits à chaque écriture gèlerait les sept autres à leur valeur du moment.
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
const HOST_ID = '507f1f77bcf86cd799439001';
const ANON_ID = '507f1f77bcf86cd799439033';
const REGISTERED_ID = '507f1f77bcf86cd799439044';

const joinPermissions = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
  canViewHistory: false,
};

const anonymousRow = {
  id: ANON_ID,
  conversationId: CONV_ID,
  type: 'anonymous',
  userId: null,
  displayName: 'ano_bob_sm123',
  role: 'member',
  isActive: true,
  permissions: joinPermissions,
  anonymousSession: {
    shareLinkId: 'link-1',
    session: { country: 'FR' },
    profile: { firstName: 'Bob', lastName: 'Smith', username: 'ano_bob_sm123' },
  },
};

const registeredRow = {
  id: REGISTERED_ID,
  conversationId: CONV_ID,
  type: 'user',
  userId: '507f1f77bcf86cd799439055',
  displayName: 'Alice',
  role: 'member',
  isActive: true,
  permissions: joinPermissions,
  anonymousSession: null,
};

type Ctx = ReturnType<typeof setup>;

function setup(viewerRole: string = 'admin', targetRow: any = anonymousRow) {
  const routes: { method: string; path: string; handler: any }[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });

  const emitted: { event: string; payload: any }[] = [];

  const prisma = {
    participant: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        if (where?.id === targetRow.id) return targetRow;
        if (where?.userId === HOST_ID) {
          return { id: 'host-row', role: viewerRole, type: 'user', user: { role: 'USER' } };
        }
        return null;
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>(async ({ data }: any) => ({ ...targetRow, ...data })),
      create: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ name: 'Invitation' }) },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'sys' }) },
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
  };

  const io = {
    to: jest.fn<any>(() => ({
      emit: (event: string, payload: any) => { emitted.push({ event, payload }); },
    })),
  };

  const fastify = {
    get: register('GET'),
    post: register('POST'),
    patch: register('PATCH'),
    put: register('PUT'),
    delete: register('DELETE'),
    prisma,
    socketIOHandler: { getIO: () => io, invalidateParticipantCache: jest.fn() },
  } as any;

  registerParticipantsRoutes(fastify, prisma as never, jest.fn(), jest.fn());

  const reply: any = { _body: undefined, _status: 200 };
  reply.status = jest.fn((code: number) => { reply._status = code; return reply; });
  reply.send = jest.fn((body: any) => { reply._body = body; return reply; });

  return { routes, prisma, reply, emitted };
}

async function patchRights(ctx: Ctx, body: any, participantId: string = ANON_ID) {
  const route = ctx.routes.find(
    (r) => r.method === 'PATCH' && r.path.includes('participants/:participantId/rights')
  );
  if (!route) throw new Error('route PATCH …/rights absente');
  await route.handler(
    {
      params: { id: CONV_ID, participantId },
      body,
      authContext: { userId: HOST_ID, isAuthenticated: true, registeredUser: { id: HOST_ID } },
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

describe('PATCH …/participants/:participantId/rights — qui peut écrire', () => {
  it('accepte un administrateur de la conversation', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true });

    expect(ctx.reply._status).toBe(200);
  });

  it('accepte un modérateur', async () => {
    const ctx = setup('moderator');

    await patchRights(ctx, { canSendFiles: true });

    expect(ctx.reply._status).toBe(200);
  });

  it('refuse un membre ordinaire — les droits d’entrée sont l’affaire de l’hôte', async () => {
    const ctx = setup('member');

    await patchRights(ctx, { canSendFiles: true });

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse sur un participant QUI A UN COMPTE — la surcharge ne modélise que les visiteurs', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { canSendFiles: true }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(400);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse un corps vide — une écriture qui ne dit rien n’est pas une écriture', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, {});

    expect(ctx.reply._status).toBe(400);
  });
});

describe('PATCH …/rights — la surcharge est un DELTA', () => {
  it('n’écrit QUE les droits nommés', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true });

    const data = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(data.anonymousSession.rights).toEqual({ canSendFiles: true });
  });

  it('conserve une surcharge antérieure que le corps ne nomme pas', async () => {
    const withPrior = {
      ...anonymousRow,
      anonymousSession: { ...anonymousRow.anonymousSession, rights: { canViewHistory: true } },
    };
    const ctx = setup('admin', withPrior);

    await patchRights(ctx, { canSendFiles: true });

    const data = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(data.anonymousSession.rights).toEqual({ canViewHistory: true, canSendFiles: true });
  });

  /**
   * Remettre un droit à sa valeur d'origine doit EFFACER son entrée, pas y
   * réécrire la même valeur : une surcharge qui recopie le join cesse de suivre
   * le join, et l'hôte n'a plus aucun moyen de revenir en arrière.
   */
  it('efface l’entrée quand le droit revient à sa valeur du join', async () => {
    const withPrior = {
      ...anonymousRow,
      anonymousSession: { ...anonymousRow.anonymousSession, rights: { canSendFiles: true } },
    };
    const ctx = setup('admin', withPrior);

    await patchRights(ctx, { canSendFiles: false });

    const data = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(data.anonymousSession.rights).toEqual({});
  });

  it('accepte de fermer l’historique — le levier que le figeage a retiré au lien', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canViewHistory: true });

    const data = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(data.anonymousSession.rights).toEqual({ canViewHistory: true });
  });
});

describe('PATCH …/rights — ce que la salle apprend', () => {
  it('diffuse les droits RÉSOLUS, pas le delta — le client affiche un état, pas une différence', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true });

    const event = ctx.emitted.find((e) => e.event === 'participant:rights-updated');
    expect(event).toBeTruthy();
    expect(event?.payload.rights).toMatchObject({
      canSendFiles: true,
      canSendMessages: true,
      canViewHistory: false,
    });
  });

  it('nomme le participant et la conversation', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true });

    const event = ctx.emitted.find((e) => e.event === 'participant:rights-updated');
    expect(event?.payload.participantId).toBe(ANON_ID);
    expect(event?.payload.conversationId).toBe(CONV_ID);
  });

  it('rend les droits résolus à l’appelant', async () => {
    const ctx = setup('admin');

    const data = await patchRights(ctx, { canSendFiles: true });

    expect(data.rights.canSendFiles).toBe(true);
  });
});
