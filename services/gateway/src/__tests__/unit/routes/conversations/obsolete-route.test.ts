/**
 * #14643 — `DELETE /conversations/:id/obsolete` : la permission est celle de la
 * suppression historique (administrateur de la conversation), et la réponse
 * rend les dates que les clients affichent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const obsoleteConversation = jest.fn<any>();
jest.mock('../../../../services/conversations/obsoleteConversation', () => ({
  obsoleteConversation: (...args: unknown[]) => obsoleteConversation(...args),
}));

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(async (_prisma: unknown, id: string) => (id === 'inconnue' ? null : id)),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any, data: any) => reply.send({ success: true, data })),
  sendForbidden: jest.fn<any>((reply: any, message: string) => reply.code(403).send({ success: false, error: message })),
  sendInternalError: jest.fn<any>((reply: any) => reply.code(500).send({ success: false })),
}));

import { registerObsoleteConversationRoute } from '../../../../routes/conversations/obsolete';

const CONV = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const OBSOLETED_AT = new Date('2026-11-02T10:00:00.000Z');
const PURGE_AFTER = new Date('2026-11-04T10:00:00.000Z');

function replyDouble() {
  const reply: any = { statusCode: 200, body: undefined };
  reply.code = jest.fn((code: number) => { reply.statusCode = code; return reply; });
  reply.send = jest.fn((body: unknown) => { reply.body = body; return reply; });
  return reply;
}

type Appel = {
  id?: string;
  conversationRole?: string | null;
  platformRole?: string;
  conversationType?: string;
  participantType?: string;
  leftAt?: Date | null;
  bannedAt?: Date | null;
  anonymous?: boolean;
  activeParticipants?: number;
  pendingRequestToOther?: boolean;
};

async function appeler(options: Appel) {
  const membership = options.conversationRole
    ? {
        role: options.conversationRole,
        type: options.participantType ?? 'user',
        leftAt: options.leftAt ?? null,
        bannedAt: options.bannedAt ?? null,
        conversation: { type: options.conversationType ?? 'group' },
      }
    : null;
  const prisma = {
    participant: {
      findMany: jest.fn<any>(async (args: any) => {
        if (args?.where?.OR) return options.pendingRequestToOther ? [{ conversationId: CONV, userId: 'recipient' }] : [];
        return membership ? [{ conversationId: CONV, userId: MOI, ...membership }] : [];
      }),
      groupBy: jest.fn<any>().mockResolvedValue([{ conversationId: CONV, _count: { _all: options.activeParticipants ?? 2 } }]),
    },
  };
  let path = '';
  let handler: any;
  const fastify: any = {
    delete: jest.fn((p: string, _opts: unknown, h: unknown) => { path = p; handler = h; }),
    socketIOHandler: { getManager: () => ({ getIO: () => null }) },
  };
  registerObsoleteConversationRoute(fastify, prisma as never, jest.fn() as never);
  const reply = replyDouble();
  await handler(
    {
      params: { id: options.id ?? CONV },
      authContext: options.anonymous
        ? { userId: MOI, type: 'anonymous', isAnonymous: true }
        : { userId: MOI, type: 'user', isAnonymous: false, registeredUser: { id: MOI, role: options.platformRole ?? 'USER' } },
    },
    reply,
  );
  return { path, reply, prisma };
}

beforeEach(() => {
  obsoleteConversation.mockReset();
  obsoleteConversation.mockResolvedValue({ kind: 'obsoleted', conversationId: CONV, obsoletedAt: OBSOLETED_AT, purgeAfter: PURGE_AFTER });
});

describe('#14643 — DELETE /conversations/:id/obsolete', () => {
  it('se déclare sous la suppression historique', async () => {
    const { path } = await appeler({ conversationRole: 'admin' });
    expect(path).toBe('/conversations/:id/obsolete');
  });

  it('un administrateur de la conversation la rend obsolète et reçoit les dates', async () => {
    const { reply } = await appeler({ conversationRole: 'admin' });
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({
      success: true,
      data: { conversationId: CONV, obsoletedAt: OBSOLETED_AT.toISOString(), purgeAfter: PURGE_AFTER.toISOString() },
    });
    expect(obsoleteConversation.mock.calls[0][1]).toEqual({ conversationId: CONV, actorId: MOI });
  });

  it('le créateur aussi', async () => {
    const { reply } = await appeler({ conversationRole: 'creator' });
    expect(reply.statusCode).toBe(200);
  });

  it('un simple membre est refusé, sans rien écrire', async () => {
    const { reply } = await appeler({ conversationRole: 'member' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un non-membre est refusé', async () => {
    const { reply } = await appeler({ conversationRole: null });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('la conversation globale ne devient jamais obsolète, même pour un administrateur de plateforme', async () => {
    const { reply } = await appeler({ id: 'meeshy', conversationRole: 'creator', platformRole: 'BIGBOSS' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('une conversation introuvable est refusée sans écriture', async () => {
    const { reply } = await appeler({ id: 'inconnue', conversationRole: 'admin' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('la membership se lit sur une participation ACTIVE de l\'appelant', async () => {
    const { prisma } = await appeler({ conversationRole: 'admin' });
    const where = prisma.participant.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ conversationId: { in: [CONV] }, userId: { in: [MOI] }, isActive: true });
  });
});

describe('#14653 — dans un tête-à-tête, l\'un OU l\'autre des deux membres la rend obsolète', () => {
  it('le membre non créateur d\'une directe la rend obsolète', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct' });
    expect(reply.statusCode).toBe(200);
    expect(obsoleteConversation.mock.calls[0][1]).toEqual({ conversationId: CONV, actorId: MOI });
  });

  it('le créateur d\'une directe aussi, comme avant', async () => {
    const { reply } = await appeler({ conversationRole: 'creator', conversationType: 'direct' });
    expect(reply.statusCode).toBe(200);
  });

  it('un tiers (aucune participation active) est refusé, sans rien écrire', async () => {
    const { reply } = await appeler({ conversationRole: null, conversationType: 'direct' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un ancien membre (participation marquée quittée) est refusé', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', leftAt: new Date('2026-11-01T00:00:00Z') });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un membre banni est refusé', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', bannedAt: new Date('2026-11-01T00:00:00Z') });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un anonyme est refusé, même s\'il porte une participation', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', anonymous: true, participantType: 'anonymous' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('une participation de type anonyme est refusée même sous un contexte enregistré', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', participantType: 'anonymous' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un simple membre d\'un GROUPE reste refusé', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'group' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un simple membre d\'une conversation publique reste refusé', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'public' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un contexte anonyme est refusé même si la participation lue est de type user', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', anonymous: true, participantType: 'user' });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('une directe anormale à trois participations actives est refusée au simple membre, sans écriture', async () => {
    const { reply, prisma } = await appeler({ conversationRole: 'member', conversationType: 'direct', activeParticipants: 3 });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
    expect(prisma.participant.groupBy.mock.calls[0][0].where).toEqual({ conversationId: { in: [CONV] }, isActive: true });
  });

  it('une directe dont l\'autre membre est parti reste effaçable par celui qui reste', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', activeParticipants: 1 });
    expect(reply.statusCode).toBe(200);
  });

  it('l\'administrateur d\'une directe anormale garde la règle de l\'administrateur', async () => {
    const { reply } = await appeler({ conversationRole: 'admin', conversationType: 'direct', activeParticipants: 3 });
    expect(reply.statusCode).toBe(200);
  });
});

describe('#14676 — une demande de message non acceptée : seul son DESTINATAIRE la rend obsolète (décision porteur 2026-11-02, option c)', () => {
  it('l\'expéditeur (créateur de la directe) d\'une demande non acceptée reçoit 403, sans écriture', async () => {
    const { reply } = await appeler({ conversationRole: 'creator', conversationType: 'direct', pendingRequestToOther: true });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('l\'expéditeur simple membre aussi', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', pendingRequestToOther: true });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('un rôle de plateforme ne lève pas la règle quand il est lui-même l\'expéditeur', async () => {
    const { reply } = await appeler({ conversationRole: 'creator', conversationType: 'direct', platformRole: 'BIGBOSS', pendingRequestToOther: true });
    expect(reply.statusCode).toBe(403);
    expect(obsoleteConversation).not.toHaveBeenCalled();
  });

  it('même si le destinataire est parti, l\'expéditeur reste refusé', async () => {
    const { reply, prisma } = await appeler({ conversationRole: 'creator', conversationType: 'direct', activeParticipants: 1, pendingRequestToOther: true });
    expect(reply.statusCode).toBe(403);
    const pendingQuery = prisma.participant.findMany.mock.calls.map((call: any) => call[0]).find((args: any) => args.where.OR);
    expect(pendingQuery.where).toEqual({
      conversationId: { in: [CONV] },
      OR: [{ messageRequestAt: { not: null } }, { messageRequestFromId: { not: null } }],
    });
  });

  it('le destinataire (sa propre ligne porte la demande, pas celle de l\'autre) la rend obsolète', async () => {
    const { reply } = await appeler({ conversationRole: 'member', conversationType: 'direct', pendingRequestToOther: false });
    expect(reply.statusCode).toBe(200);
  });

  it('un groupe garde la règle de l\'administrateur, demande en attente ou non', async () => {
    const { reply } = await appeler({ conversationRole: 'admin', conversationType: 'group', pendingRequestToOther: true });
    expect(reply.statusCode).toBe(200);
  });
});
