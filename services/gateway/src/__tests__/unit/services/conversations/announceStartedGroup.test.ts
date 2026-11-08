/**
 * #14644 (B) — un groupe neuf ne s'annonce aux invités qu'au PREMIER message :
 * `conversation:new` et la notification d'invitation partent alors, comme à la
 * réactivation d'un tête-à-tête silencieux. Une demande en attente (#14107) ne
 * s'annonce pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { announceStartedGroup, startSilentGroup } from '../../../../services/conversations/announceStartedGroup';

const CONV = '507f1f77bcf86cd799439011';
const CREATOR = '507f1f77bcf86cd799439022';
const ALICE = '507f1f77bcf86cd799439033';
const BOB = '507f1f77bcf86cd799439044';
const CREATED_AT = new Date('2026-11-02T09:00:00.000Z');

function conversation(type: string, title: string | null = 'Équipe') {
  return {
    id: CONV,
    type,
    title,
    createdAt: CREATED_AT,
    participants: [
      { userId: CREATOR, role: 'creator', messageRequestAt: null, user: { id: CREATOR, displayName: 'Créa', username: 'crea', avatar: 'a.png', firstName: null, lastName: null } },
      { userId: ALICE, role: 'member', messageRequestAt: null, user: { id: ALICE, displayName: 'Alice', username: 'alice', avatar: null, firstName: null, lastName: null } },
      { userId: BOB, role: 'member', messageRequestAt: new Date(), user: { id: BOB, displayName: 'Bob', username: 'bob', avatar: null, firstName: null, lastName: null } },
    ],
  };
}

async function annoncer(row: unknown) {
  const prisma = { conversation: { findUnique: jest.fn<any>().mockResolvedValue(row) } };
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }) };
  const notificationService = { createConversationInviteNotification: jest.fn<any>().mockResolvedValue(null) };
  await announceStartedGroup({ prisma: prisma as never, io, notificationService }, CONV);
  return { prisma, emitted, notificationService };
}

describe('#14644 — un groupe démarré s\'annonce', () => {
  it('conversation:new part vers chaque invité, sans le créateur (déjà prévenu à la création)', async () => {
    const { emitted, prisma } = await annoncer(conversation('group'));
    expect((prisma.conversation.findUnique.mock.calls[0][0] as any).where).toEqual({ id: CONV });
    expect(emitted.map((e) => e.room).sort()).toEqual([`user:${ALICE}`, `user:${BOB}`].sort());
    expect(emitted.every((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW)).toBe(true);
    expect(emitted[0].payload).toEqual({
      conversationId: CONV,
      conversationType: 'group',
      title: 'Équipe',
      creatorId: CREATOR,
      participantIds: [CREATOR, ALICE, BOB],
      createdAt: CREATED_AT.toISOString(),
    });
  });

  it('la notification d\'invitation part vers les invités entrés directement, jamais vers une demande en attente', async () => {
    const { notificationService } = await annoncer(conversation('group'));
    expect(notificationService.createConversationInviteNotification).toHaveBeenCalledTimes(1);
    expect(notificationService.createConversationInviteNotification).toHaveBeenCalledWith({
      invitedUserId: ALICE,
      inviterId: CREATOR,
      inviterUsername: 'Créa',
      inviterAvatar: 'a.png',
      conversationId: CONV,
      conversationTitle: 'Équipe',
      conversationType: 'group',
    });
  });

  it('le nom de l\'inviteur retombe sur son pseudo, et un titre absent se compose des membres', async () => {
    const row = conversation('group', null);
    row.participants[0].user.displayName = null as never;
    const { notificationService, emitted } = await annoncer(row);
    const call = notificationService.createConversationInviteNotification.mock.calls[0][0] as any;
    expect(call.inviterUsername).toBe('crea');
    expect(typeof call.conversationTitle).toBe('string');
    expect(call.conversationTitle.length).toBeGreaterThan(0);
    expect(emitted[0].payload.title).toBe(call.conversationTitle);
  });

  it('un tête-à-tête n\'est pas concerné', async () => {
    const { emitted, notificationService } = await annoncer(conversation('direct', null));
    expect(emitted).toEqual([]);
    expect(notificationService.createConversationInviteNotification).not.toHaveBeenCalled();
  });

  it('un groupe sans invité n\'annonce rien', async () => {
    const row = { ...conversation('group'), participants: [conversation('group').participants[0]] };
    const { emitted, notificationService } = await annoncer(row);
    expect(emitted).toEqual([]);
    expect(notificationService.createConversationInviteNotification).not.toHaveBeenCalled();
  });

  it('une conversation introuvable n\'annonce rien', async () => {
    const { emitted } = await annoncer(null);
    expect(emitted).toEqual([]);
  });
});

describe('#14644 — un groupe silencieux se démarre AVANT un appel', () => {
  async function demarrer(flippedCount: number) {
    const prisma = {
      conversation: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: flippedCount }),
        findUnique: jest.fn<any>().mockResolvedValue(conversation('group')),
      },
    };
    const emitted: Array<{ room: string; event: string }> = [];
    const io = { to: (room: string) => ({ emit: (event: string) => emitted.push({ room, event }) }) };
    const notificationService = { createConversationInviteNotification: jest.fn<any>().mockResolvedValue(null) };
    const started = await startSilentGroup({ prisma: prisma as never, io, notificationService }, CONV);
    return { prisma, emitted, notificationService, started };
  }

  it('bascule firstMessageSentAt sur un GROUPE silencieux seulement, puis l\'annonce exactement comme un premier message', async () => {
    const { prisma, emitted, notificationService, started } = await demarrer(1);
    const flip = prisma.conversation.updateMany.mock.calls[0][0] as any;
    expect(flip.where).toEqual({ id: CONV, type: 'group', firstMessageSentAt: null });
    expect(flip.data.firstMessageSentAt).toBeInstanceOf(Date);
    expect(started).toBe(true);
    expect(emitted.map((e) => e.room).sort()).toEqual([`user:${ALICE}`, `user:${BOB}`].sort());
    expect(notificationService.createConversationInviteNotification).toHaveBeenCalledTimes(1);
  });

  it('un groupe déjà démarré (ou un tête-à-tête) ne s\'annonce pas une seconde fois', async () => {
    const { prisma, emitted, notificationService, started } = await demarrer(0);
    expect(started).toBe(false);
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(notificationService.createConversationInviteNotification).not.toHaveBeenCalled();
  });
});

describe('#14690 — conversation:new porte les capacités de SON destinataire', () => {
  it('un invité administrateur peut rendre le groupe obsolète, un simple membre non', async () => {
    const roles: Record<string, string> = { [ALICE]: 'admin', [BOB]: 'member' };
    const prisma = {
      conversation: { findUnique: jest.fn<any>().mockResolvedValue(conversation('group')) },
      user: { findMany: jest.fn<any>(async (args: any) => args.where.id.in.map((id: string) => ({ id, role: 'USER' }))) },
      participant: {
        findMany: jest.fn<any>(async (args: any) =>
          args.where.userId.in.map((userId: string) => ({
            conversationId: CONV, userId, role: roles[userId], type: 'user', leftAt: null, bannedAt: null,
            conversation: { type: 'group', identifier: 'mshy_equipe' },
          }))),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    };
    const emitted: Array<{ room: string; payload: any }> = [];
    const io = { to: (room: string) => ({ emit: (_event: string, payload: any) => emitted.push({ room, payload }) }) };
    await announceStartedGroup({ prisma: prisma as never, io, notificationService: null }, CONV);
    const byRoom = new Map(emitted.map((e) => [e.room, e.payload.viewerCapabilities]));
    expect(byRoom.get(`user:${ALICE}`)).toEqual({ canMakeObsolete: true });
    expect(byRoom.get(`user:${BOB}`)).toEqual({ canMakeObsolete: false });
  });

  it('une lecture impossible laisse le payload antérieur, sans capacité fabriquée', async () => {
    const { emitted } = await annoncer(conversation('group'));
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.every((e) => !('viewerCapabilities' in e.payload))).toBe(true);
  });
});
