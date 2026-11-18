/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../messaging/messageRequests'),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));
jest.mock('../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn() }));
jest.mock('../../achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn(async () => undefined) })),
}));

import { admitConversationMember } from '../memberAdmission';

const CONV = '64b7f0c2a1b2c3d4e5f60719';

type Row = { id: string; conversationId: string; userId: string; isActive: boolean; bannedAt: Date | null; joinedAt: Date; role?: string; permissions?: Record<string, boolean> };

const world = (rows: Row[]) => {
  const order: string[] = [];
  const prisma: any = {
    user: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === 'dave' ? { id: 'dave', username: 'dave', displayName: 'Dave', avatar: null, systemLanguage: 'es' } : null)),
      findMany: jest.fn(async () => []),
    },
    participant: {
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.conversationId === where.conversationId && (where.userId === undefined || typeof where.userId !== 'string' || r.userId === where.userId))),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => rows.length),
      create: jest.fn(async ({ data }: any) => {
        order.push('participant.create');
        const row = { id: `p-${data.userId}`, ...data, isActive: true, bannedAt: null };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    message: {
      create: jest.fn(async ({ data }: any) => {
        order.push('message.create');
        return { id: 'm-join', createdAt: new Date(), ...data };
      }),
      findFirst: jest.fn(async () => null),
    },
    conversation: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ id: CONV, type: 'group', title: 'Amis', obsoleteAt: null })),
    },
  };
  const notificationService = {
    createAddedToConversationNotification: jest.fn(async () => undefined),
    createMemberJoinedNotificationsBatch: jest.fn(async () => undefined),
  };
  const engagement = { recordActivity: jest.fn(async () => undefined) };
  const joinRoom = jest.fn(async () => { order.push('joinRoom'); });
  const broadcastMessage = jest.fn(async () => undefined);
  return { prisma, notificationService, engagement, joinRoom, broadcastMessage, order, rows };
};

const admit = (w: ReturnType<typeof world>, notifyInvitee?: boolean, conversation: { type: string; encryptionMode: string | null } = { type: 'group', encryptionMode: null }) =>
  admitConversationMember(
    { prisma: w.prisma, io: null, joinRoom: w.joinRoom, broadcastMessage: w.broadcastMessage, notificationService: w.notificationService as never, engagement: w.engagement },
    {
      conversationId: CONV,
      conversation: { isActive: true, closedAt: null, ...conversation },
      userId: 'dave',
      currentUserId: 'alice',
      addedBy: { participantId: 'p-alice', displayName: 'Alice' },
      community: null,
      ...(notifyInvitee === undefined ? {} : { notifyInvitee }),
    }
  );

describe('admitConversationMember — la porte d’ajout, partagée par la route et par l’appel (#19650)', () => {
  it('fait entrer un membre sans historique, rejoint la room AVANT l’avis d’arrivée', async () => {
    const w = world([]);
    const verdict = await admit(w);

    expect(verdict).toEqual({ userId: 'dave', outcome: 'new', participantId: 'p-dave' });
    const data = w.prisma.participant.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ conversationId: CONV, userId: 'dave', role: 'member', language: 'es' });
    expect(data.permissions.canViewHistory).toBe(false);
    expect(w.order).toEqual(['participant.create', 'joinRoom', 'message.create']);
    expect(w.notificationService.createAddedToConversationNotification).toHaveBeenCalledTimes(1);
  });

  it('l’appel fait sonner l’invité au lieu de le notifier (notifyInvitee: false)', async () => {
    const w = world([]);
    await admit(w, false);
    expect(w.notificationService.createAddedToConversationNotification).not.toHaveBeenCalled();
  });

  it('un membre déjà actif ne reçoit rien et rien n’est écrit', async () => {
    const w = world([{ id: 'p-dave', conversationId: CONV, userId: 'dave', isActive: true, bannedAt: null, joinedAt: new Date() }]);
    expect(await admit(w)).toEqual({ userId: 'dave', outcome: 'already-member' });
    expect(w.prisma.participant.create).not.toHaveBeenCalled();
    expect(w.prisma.message.create).not.toHaveBeenCalled();
  });

  it('un banni reste dehors', async () => {
    const w = world([{ id: 'p-dave', conversationId: CONV, userId: 'dave', isActive: false, bannedAt: new Date(), joinedAt: new Date() }]);
    expect(await admit(w)).toEqual({ userId: 'dave', outcome: 'banned' });
    expect(w.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('consulte la loi unique : un tête-à-tête chiffré ou une conversation externe ne gagne aucun membre', async () => {
    for (const conversation of [{ type: 'direct', encryptionMode: 'e2ee' }, { type: 'external', encryptionMode: null }]) {
      const w = world([]);
      expect(await admit(w, undefined, conversation)).toEqual({ userId: 'dave', outcome: 'not-found' });
      expect(w.prisma.participant.create).not.toHaveBeenCalled();
    }
  });
});
