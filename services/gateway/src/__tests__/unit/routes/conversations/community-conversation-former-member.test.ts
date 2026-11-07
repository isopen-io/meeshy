/**
 * #16603 — un ANCIEN membre d'une communauté n'y crée plus de conversation.
 *
 * `POST /conversations` avec un `communityId` chargeait TOUTES les lignes
 * `CommunityMember` et admettait sur la seule EXISTENCE de la ligne de
 * l'appelant. Un départ ou un retrait laisse `isActive: false` : l'ancien
 * membre passait la garde, et `reconcileCommunityMembership` réactivait
 * ensuite sa ligne — il rentrait dans une communauté PRIVÉE dont un
 * administrateur venait de le retirer.
 *
 * Le double honore le `where` posé sur la relation `members`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// #14107 — la boîte de demandes a ses propres témoins (`messageRequests.test.ts`) : ici, tout membre entre directement.
jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

// Directive porteur du 2026-11-01 : une conversation naît chiffrée au repos,
// sous une clé obtenue avant sa création.
jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({
    recordEvent: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';
import { sendForbidden, sendNotFound } from '../../../../utils/response';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';
const COMMUNITY = '507f1f77bcf86cd799439044';

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };

type Communaute = { readonly isPrivate?: boolean; readonly isActive?: boolean };

function prismaDouble(lignes: readonly Ligne[], communaute: Communaute = {}) {
  const garde = (ligne: Ligne, where: Record<string, unknown> | undefined) =>
    !where || Object.entries(where).every(([k, v]) => (ligne as unknown as Record<string, unknown>)[k] === v);
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        const isActive = communaute.isActive ?? true;
        if (args?.where?.isActive === true && !isActive) return null;
        const relation = args?.include?.members ?? args?.select?.members;
        const where = typeof relation === 'object' ? relation.where : undefined;
        return { id: COMMUNITY, createdBy: AUTRE, isPrivate: communaute.isPrivate ?? false, members: lignes.filter((l) => garde(l, where)) };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => lignes
        .filter((l) => args.where.userId.in.includes(l.userId))
        .map((l) => ({ id: `cm-${l.userId}`, ...l }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({ id: CONV_ID, type: 'group', title: 'Salon', createdAt: new Date(), participants: [] })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>(async (args: any) => (args.where.OR ? null : { id: args.where.id })),
    },
  };
}

function replyDouble() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    header: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

async function creerDansLaCommunaute(lignes: readonly Ligne[], options: Communaute & { readonly participantIds?: readonly string[] } = {}) {
  const prisma = prismaDouble(lignes, options);
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());
  await handler(
    {
      body: { type: 'group', title: 'Salon', participantIds: options.participantIds ?? [], communityId: COMMUNITY },
      params: {}, query: {}, headers: {},
      authContext: {
        type: 'user', isAuthenticated: true, isAnonymous: false,
        userId: MOI, registeredUser: { id: MOI, role: 'USER' },
      },
      user: { userId: MOI },
    },
    replyDouble(),
  );
  return prisma;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#16603 — POST /conversations dans une communauté', () => {
  it('refuse un ANCIEN membre, sans rien créer ni réactiver', async () => {
    const prisma = await creerDansLaCommunaute([{ userId: MOI, role: 'member', isActive: false }]);

    expect(sendForbidden).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('admet un membre ACTIF — le témoin miroir', async () => {
    const prisma = await creerDansLaCommunaute([{ userId: MOI, role: 'member', isActive: true }]);

    expect(sendForbidden).not.toHaveBeenCalled();
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});

const INVITE = '507f1f77bcf86cd799439055';

describe('#16639 — créer une conversation n\'admet dans la communauté que ce que l\'appelant peut admettre', () => {
  it('communauté PRIVÉE : un simple membre n\'y fait entrer personne, et rien n\'est créé', async () => {
    const prisma = await creerDansLaCommunaute(
      [{ userId: MOI, role: 'member', isActive: true }],
      { isPrivate: true, participantIds: [INVITE] },
    );

    expect(sendForbidden).toHaveBeenCalledWith(expect.anything(), expect.any(String), { code: 'COMMUNITY_INVITE_FORBIDDEN' });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('communauté PRIVÉE : un simple membre ne réintègre pas un administrateur retiré', async () => {
    const prisma = await creerDansLaCommunaute(
      [{ userId: MOI, role: 'member', isActive: true }, { userId: INVITE, role: 'admin', isActive: false }],
      { isPrivate: true, participantIds: [INVITE] },
    );

    expect(sendForbidden).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('communauté DÉSACTIVÉE : 404, rien n\'est créé ni réconcilié', async () => {
    const prisma = await creerDansLaCommunaute(
      [{ userId: MOI, role: 'admin', isActive: true }],
      { isActive: false, participantIds: [INVITE] },
    );

    expect(sendNotFound).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('communauté PUBLIQUE : un membre y fait entrer son invité, en MEMBER — le témoin miroir', async () => {
    const prisma = await creerDansLaCommunaute(
      [{ userId: MOI, role: 'member', isActive: true }],
      { participantIds: [INVITE] },
    );

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNITY, userId: INVITE, role: 'member' }],
    });
  });
});
