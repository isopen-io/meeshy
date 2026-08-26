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
    // Même forme que la production : le handler expose un MANAGER, qui porte
    // `getIO` et `invalidateParticipantCache`. Un mock qui les poserait à plat
    // sur le handler ferait passer un test que `tsc` refuse — c'est exactement
    // ce qui a fait rougir `Build (bun)` en CI pendant que la suite était verte.
    socketIOHandler: {
      getManager: () => ({ getIO: () => io, invalidateParticipantCache: jest.fn() }),
    },
  } as any;

  registerParticipantsRoutes(fastify, prisma as never, jest.fn(), jest.fn());

  const reply: any = { _body: undefined, _status: 200 };
  reply.status = jest.fn((code: number) => { reply._status = code; return reply; });
  reply.send = jest.fn((body: any) => { reply._body = body; return reply; });

  return { routes, prisma, reply, emitted, io };
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

// ─── L'octroi d'historique par DATE ──────────────────────────────────────────
//
// Second levier de l'hôte, et le seul qui vaille pour un participant INSCRIT :
// `historyVisibleFrom` ouvre l'historique depuis un instant — jamais depuis un
// message, qui se supprime. `null` retire l'octroi. La garde
// `PARTICIPANT_HAS_ACCOUNT` ne concerne que la surcharge booléenne.

describe('PATCH …/rights — `historyVisibleFrom`, l’octroi par date', () => {
  const GRANTED_FROM = '2026-01-01T00:00:00.000Z';

  it('accepte un octroi par date sur un participant INSCRIT', async () => {
    const ctx = setup('admin', registeredRow);

    const data = await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(200);
    const written = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(written).toEqual({ historyVisibleFrom: new Date(GRANTED_FROM) });
    expect(data.historyVisibleFrom).toBe(GRANTED_FROM);
  });

  it('accepte un octroi par date sur un visiteur sans compte, sans toucher à sa surcharge', async () => {
    const withPrior = {
      ...anonymousRow,
      anonymousSession: { ...anonymousRow.anonymousSession, rights: { canSendFiles: true } },
    };
    // `admin` et non `moderator` : le rang qui peut ÉCRIRE la date est celui
    // que le plancher DISPENSE (voir la section « qui peut octroyer » ci-dessous).
    const ctx = setup('admin', withPrior);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM });

    const written = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(written).toEqual({ historyVisibleFrom: new Date(GRANTED_FROM) });
  });

  it('retire l’octroi avec `null`', async () => {
    const ctx = setup('admin', { ...registeredRow, historyVisibleFrom: new Date(GRANTED_FROM) });

    const data = await patchRights(ctx, { historyVisibleFrom: null }, REGISTERED_ID);

    const written = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(written).toEqual({ historyVisibleFrom: null });
    expect(data.historyVisibleFrom).toBeNull();
  });

  it('écrit surcharge ET date dans la même écriture pour un visiteur', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true, historyVisibleFrom: GRANTED_FROM });

    const written = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(written.anonymousSession.rights).toEqual({ canSendFiles: true });
    expect(written.historyVisibleFrom).toEqual(new Date(GRANTED_FROM));
  });

  it('refuse un membre ordinaire — l’octroi est l’affaire de l’hôte', async () => {
    const ctx = setup('member', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse une date illisible', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: 'hier' }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(400);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('garde la garde `PARTICIPANT_HAS_ACCOUNT` pour les droits BOOLÉENS d’un inscrit, même accompagnés d’une date', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { canSendFiles: true, historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(400);
    expect(ctx.reply._body?.code ?? ctx.reply._body?.error?.code).toBe('PARTICIPANT_HAS_ACCOUNT');
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('diffuse l’octroi avec les droits — dans la room de l’inscrit, clef `User.id`', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    const events = ctx.emitted.filter((e) => e.event === 'participant:rights-updated');
    expect(events).toHaveLength(2);
    expect(events[0]?.payload.historyVisibleFrom).toBe(GRANTED_FROM);
    expect(events[0]?.payload.participantId).toBe(REGISTERED_ID);
    const rooms = (ctx.io.to as any).mock.calls.map((c: any[]) => c[0]);
    expect(rooms).toContain(`user:${registeredRow.userId}`);
  });

  it('sert l’octroi EN VIGUEUR quand seule la surcharge change', async () => {
    const ctx = setup('admin', { ...anonymousRow, historyVisibleFrom: new Date(GRANTED_FROM) });

    const data = await patchRights(ctx, { canSendFiles: true });

    expect(data.historyVisibleFrom).toBe(GRANTED_FROM);
  });
});

// ─── Qui peut OCTROYER l'historique par date ─────────────────────────────────
//
// L'octroi n'est pas un droit d'entrée de plus : il OUVRE ce qui précède
// l'arrivée, et la règle produit le réserve à un ADMINISTRATEUR de la
// conversation. Un modérateur est lui-même BORNÉ par le plancher — le rang 1 de
// `historyFloorFor` exige `admin` — donc le laisser écrire ce champ lui donnait
// le moyen de se l'ouvrir À LUI-MÊME, sur sa propre ligne, sans qu'aucun admin
// n'intervienne. Les droits BOOLÉENS, eux, restent à sa portée : ils ne
// franchissent aucun plancher.

describe('PATCH …/rights — l’octroi par date est réservé à l’administrateur', () => {
  const GRANTED_FROM = '2026-01-01T00:00:00.000Z';

  it('refuse un modérateur qui octroie l’historique à un tiers', async () => {
    const ctx = setup('moderator', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse un modérateur qui s’octroie l’historique À LUI-MÊME', async () => {
    const selfRow = { ...registeredRow, id: HOST_ID, userId: HOST_ID, role: 'moderator' };
    const ctx = setup('moderator', selfRow);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, HOST_ID);

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse un modérateur qui glisse la date à côté d’un droit booléen permis', async () => {
    const ctx = setup('moderator');

    await patchRights(ctx, { canSendFiles: true, historyVisibleFrom: GRANTED_FROM });

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('laisse un modérateur écrire les droits BOOLÉENS — aucun ne franchit un plancher', async () => {
    const ctx = setup('moderator');

    await patchRights(ctx, { canSendFiles: true, canViewHistory: true });

    expect(ctx.reply._status).toBe(200);
    const data = (ctx.prisma.participant.update as any).mock.calls[0][0].data;
    expect(data.anonymousSession.rights).toEqual({ canSendFiles: true, canViewHistory: true });
  });

  it('accepte un creator', async () => {
    const ctx = setup('creator', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: GRANTED_FROM }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(200);
  });

  it('refuse un modérateur qui RETIRE l’octroi — retirer est écrire', async () => {
    const ctx = setup('moderator', { ...registeredRow, historyVisibleFrom: new Date(GRANTED_FROM) });

    await patchRights(ctx, { historyVisibleFrom: null }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(403);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });
});

// ─── Une date FUTURE n'est pas un octroi ─────────────────────────────────────
//
// Sans borne supérieure, poser une date à venir retournait le levier : le
// plancher (`createdAt: { gte: future }`) exclut aussi les messages À VENIR, y
// compris ceux que le participant écrit LUI-MÊME. Un « octroi d'historique »
// devenait ainsi une cécité totale et silencieuse — un mute déguisé, qu'aucune
// erreur ne signalait à celui qui l'écrivait.

describe('PATCH …/rights — `historyVisibleFrom` ne peut pas être dans le futur', () => {
  const inFuture = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const inPast = () => new Date(Date.now() - 60 * 1000).toISOString();

  it('refuse une date postérieure à l’instant de la requête', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: inFuture() }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(400);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuse la date future même accompagnée de droits booléens valides', async () => {
    const ctx = setup('admin');

    await patchRights(ctx, { canSendFiles: true, historyVisibleFrom: inFuture() });

    expect(ctx.reply._status).toBe(400);
    expect(ctx.prisma.participant.update).not.toHaveBeenCalled();
  });

  it('accepte une date PASSÉE — la borne ne ferme que le futur', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: inPast() }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(200);
  });

  it('laisse passer `null` — retirer l’octroi n’est pas une date', async () => {
    const ctx = setup('admin', registeredRow);

    await patchRights(ctx, { historyVisibleFrom: null }, REGISTERED_ID);

    expect(ctx.reply._status).toBe(200);
  });
});
