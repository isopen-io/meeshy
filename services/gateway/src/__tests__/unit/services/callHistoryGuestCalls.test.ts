/**
 * L'historique des appels montre aussi les appels où l'on était INVITÉ sans
 * être membre de la conversation (#8468).
 *
 * Une personne invitée dans un appel en cours (#8433) le rejoint par une
 * participation INACTIVE (`role: 'call-guest'`) : elle n'est pas membre de la
 * conversation. Le journal ne listait que les appels des conversations dont le
 * lecteur est membre ACTIF — l'invité ne retrouvait pas l'appel qu'il avait
 * passé. Il le retrouve désormais, sans rien apprendre de la conversation :
 * ni son titre, ni son avatar, ni ses membres hors de l'appel.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { clearCallHistory, hideCallFromHistory, listCallHistory } from '../../../services/calls/callHistoryList';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const HOST = '507f1f77bcf86cd799439011';
const MEMBER = '507f1f77bcf86cd799439012';
const GUEST = '507f1f77bcf86cd799439013';
const STRANGER = '507f1f77bcf86cd799439014';

type Conversation = { id: string; type: string; title: string | null; avatar: string | null; members: readonly string[] };
type Call = {
  id: string;
  conversationId: string;
  initiatorId: string;
  status: string;
  startedAt: Date;
  answeredAt: Date | null;
  joined: readonly string[];
  invitedUserIds?: readonly string[];
  hiddenForUserIds?: string[];
};
type Where = Record<string, unknown>;

const SECRET_GROUP: Conversation = {
  id: 'conv-group',
  type: 'group',
  title: 'Projet confidentiel',
  avatar: 'https://cdn/secret.png',
  members: [HOST, MEMBER],
};
const DUO: Conversation = { id: 'conv-duo', type: 'direct', title: null, avatar: null, members: [HOST, MEMBER] };

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const evaluate = (call: Call, where: Where, conversations: readonly Conversation[]): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const c = cond as Record<string, any>;
    const conversation = conversations.find((conv) => conv.id === call.conversationId)!;
    switch (key) {
      case 'AND':
        return (cond as Where[]).every((w) => evaluate(call, w, conversations));
      case 'OR':
        return (cond as Where[]).some((w) => evaluate(call, w, conversations));
      case 'id':
        if (typeof cond === 'string') return call.id === cond;
        if ('in' in c) return c.in.includes(call.id);
        if ('notIn' in c) return !c.notIn.includes(call.id);
        throw new Error('filtre d’id non évalué');
      case 'startedAt':
        return call.startedAt >= c.gte;
      case 'status':
        return c.in.includes(call.status);
      case 'conversationId':
        return c.in.includes(call.conversationId);
      case 'initiatorId':
        return call.initiatorId !== c.not;
      case 'answeredAt':
        return call.answeredAt !== null;
      case 'conversation': {
        const some = c.participants.some;
        if (some.isActive !== true || Object.keys(some).length !== 2) throw new Error('portée de membre inattendue');
        return conversation.members.includes(some.userId);
      }
      case 'participants':
        if ('some' in c) return call.joined.includes(c.some.participant.userId);
        if ('none' in c) return !call.joined.includes(c.none.participant.userId);
        throw new Error('filtre de participants non évalué');
      case 'invitedUserIds':
        return (call.invitedUserIds ?? []).includes(c.has);
      case 'hiddenForUserIds':
        return (call.hiddenForUserIds ?? []).includes(c.has);
      default:
        throw new Error(`clé de where non évaluée par le faux : ${key}`);
    }
  });

const prismaOver = (calls: Call[], conversations: readonly Conversation[] = [SECRET_GROUP, DUO]) => {
  const participantId = (userId: string) => `p-${userId}`;
  const prisma = {
    callSession: {
      findMany: jest.fn(async (args: { where: Where; select: Record<string, any> }) =>
        calls
          .filter((call) => evaluate(call, args.where, conversations))
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .map((call) => {
            const conversation = conversations.find((conv) => conv.id === call.conversationId)!;
            const membership = args.select.conversation?.select?.participants?.where as { userId: string } | undefined;
            return {
              ...call,
              mode: 'sfu',
              endReason: null,
              endedAt: null,
              duration: null,
              bytesSent: null,
              bytesReceived: null,
              metadata: null,
              reactionCounts: null,
              conversation: {
                type: conversation.type,
                title: conversation.title,
                avatar: conversation.avatar,
                participants: membership && conversation.members.includes(membership.userId) ? [{ id: participantId(membership.userId) }] : [],
              },
            };
          })
      ),
      findFirst: jest.fn(async (args: { where: Where }) => {
        const call = calls.find((c) => evaluate(c, args.where, conversations));
        return call ? { id: call.id, hiddenForUserIds: call.hiddenForUserIds ?? [] } : null;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: { hiddenForUserIds: { push: string } } }) => {
        const call = calls.find((c) => c.id === args.where.id)!;
        call.hiddenForUserIds = [...(call.hiddenForUserIds ?? []), args.data.hiddenForUserIds.push];
        return call;
      }),
      updateMany: jest.fn(async (args: { where: Where; data: { hiddenForUserIds: { push: string } } }) => {
        const hit = calls.filter((call) => evaluate(call, args.where, conversations));
        hit.forEach((call) => {
          call.hiddenForUserIds = [...(call.hiddenForUserIds ?? []), args.data.hiddenForUserIds.push];
        });
        return { count: hit.length };
      }),
    },
    participant: {
      findMany: jest.fn(async (args: { where: { conversationId: { in: string[] }; userId: { not: string } } }) =>
        conversations
          .filter((conv) => args.where.conversationId.in.includes(conv.id))
          .flatMap((conv) =>
            conv.members
              .filter((m) => m !== args.where.userId.not)
              .map((m) => ({
                conversationId: conv.id,
                user: { id: m, username: m, displayName: `Membre ${m.slice(-2)}`, avatar: null, phoneNumber: '+33600000000', isOnline: false },
              }))
          )
      ),
    },
    callParticipant: {
      findMany: jest.fn(async (args: { where: { callSessionId: { in: string[] }; participant?: { userId: string } } }) =>
        calls
          .filter((call) => args.where.callSessionId.in.includes(call.id))
          .flatMap((call) =>
            call.joined
              .filter((userId) => !args.where.participant || args.where.participant.userId === userId)
              .map((userId) => ({
                callSessionId: call.id,
                participant: { id: participantId(userId), userId, displayName: `Joint ${userId.slice(-2)}`, avatar: null, user: null },
              }))
          )
      ),
    },
  } as unknown as PrismaClient;
  return prisma;
};

const journal = async (prisma: PrismaClient, userId: string) =>
  (await listCallHistory(prisma, userId, { limit: 30, filter: 'all', viewer: { userId, role: 'USER' } as never })).items;

const groupCallWithGuest = (overrides: Partial<Call> = {}): Call => ({
  id: 'call-1',
  conversationId: SECRET_GROUP.id,
  initiatorId: HOST,
  status: 'ended',
  startedAt: minutesAgo(10),
  answeredAt: minutesAgo(9),
  joined: [HOST, GUEST],
  invitedUserIds: [GUEST],
  ...overrides,
});

describe('l’historique des appels d’un invité qui n’est pas membre (#8468)', () => {
  it('l’invité qui a rejoint retrouve l’appel, reçu', async () => {
    const items = await journal(prismaOver([groupCallWithGuest()]), GUEST);
    expect(items.map((i) => [i.callId, i.direction])).toEqual([['call-1', 'incoming']]);
  });

  it('l’invité qui n’a pas décroché le retrouve, manqué', async () => {
    const items = await journal(prismaOver([groupCallWithGuest({ joined: [HOST, MEMBER] })]), GUEST);
    expect(items.map((i) => [i.callId, i.direction])).toEqual([['call-1', 'missed']]);
  });

  it('ne lui montre ni le titre ni l’avatar de la conversation', async () => {
    const [item] = await journal(prismaOver([groupCallWithGuest()]), GUEST);
    expect(item.conversationTitle).toBeNull();
    expect(item.conversationAvatar).toBeNull();
  });

  it('ne lui nomme que les personnes de l’appel, jamais un membre qui n’y était pas', async () => {
    const [item] = await journal(prismaOver([groupCallWithGuest()]), GUEST);
    expect(item.peer).toBeNull();
    expect(item.participants.map((p) => p.userId)).toEqual([HOST]);
  });

  it('dans un appel de duo, ne lui sert pas l’autre membre comme pair, avec son numéro', async () => {
    const [item] = await journal(prismaOver([groupCallWithGuest({ conversationId: DUO.id })]), GUEST);
    expect(item.peer).toBeNull();
    expect(item.conversationType).toBe('group');
    expect(JSON.stringify(item)).not.toContain('+33600000000');
  });

  it('les membres gardent le titre de leur conversation', async () => {
    const [item] = await journal(prismaOver([groupCallWithGuest()]), MEMBER);
    expect(item.conversationTitle).toBe('Projet confidentiel');
  });

  it('une personne ni membre, ni invitée, ni jointe ne voit rien', async () => {
    expect(await journal(prismaOver([groupCallWithGuest()]), STRANGER)).toEqual([]);
  });

  it('l’invité peut effacer l’appel de son journal, et le vider', async () => {
    const calls = [groupCallWithGuest(), groupCallWithGuest({ id: 'call-2', startedAt: minutesAgo(20) })];
    const prisma = prismaOver(calls);
    expect(await hideCallFromHistory(prisma, GUEST, 'call-1')).toBe('hidden');
    expect((await journal(prisma, GUEST)).map((i) => i.callId)).toEqual(['call-2']);
    expect(await clearCallHistory(prisma, GUEST)).toBe(1);
    expect(await journal(prisma, GUEST)).toEqual([]);
  });

  it('une personne étrangère à l’appel ne peut pas l’effacer — même réponse qu’un id inexistant', async () => {
    expect(await hideCallFromHistory(prismaOver([groupCallWithGuest()]), STRANGER, 'call-1')).toBe('not-found');
  });
});
