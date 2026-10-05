/**
 * Configurer une conversation depuis l'administration, SANS en être membre
 * (#7845, #7999) :
 *
 *   PATCH /admin/conversations/:conversationId
 *   PATCH /admin/conversations/:conversationId/participants/:userId
 *   POST  /admin/conversations/:conversationId/participants/:userId/remove
 *
 * Les routes de membre exigent d'être DANS la conversation (« une fois dans »,
 * `utils/conversation-authority.ts`) : un administrateur qui instruit un
 * signalement sur un groupe dont il n'est pas membre y recevait 403. Ces trois
 * gestes lui rendent la main, sous le rang d'administration, un motif écrit et
 * une trace.
 *
 * Le double Prisma rend ce que la base rendrait et ENREGISTRE ce qu'on lui
 * écrit : un témoin d'écriture assert sur la ligne écrite et l'événement émis,
 * jamais sur le seul statut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439aaa';
const MEMBER_ID = '507f1f77bcf86cd799439bbb';
const CREATOR_ID = '507f1f77bcf86cd799439ccc';
const BOSS_ID = '507f1f77bcf86cd799439ddd';
const GONE_ID = '507f1f77bcf86cd799439eee';
const MOTIF = 'signalement #42 instruit';

type AnyRecord = Record<string, unknown>;

type Etat = {
  readonly type?: string;
  readonly identifier?: string;
  readonly encryptionMode?: string | null;
  readonly existe?: boolean;
  readonly closedAt?: Date | null;
};

const PARTICIPANTS = [
  { id: 'pt-member', userId: MEMBER_ID, isActive: true, role: 'member', displayName: 'Bob' },
  { id: 'pt-creator', userId: CREATOR_ID, isActive: true, role: 'creator', displayName: 'Alice' },
  { id: 'pt-gone', userId: GONE_ID, isActive: false, role: 'member', displayName: 'Old' },
  { id: 'pt-boss', userId: BOSS_ID, isActive: true, role: 'member', displayName: 'Boss' },
];

const RANG_DE_PLATEFORME: Readonly<Record<string, string>> = { [BOSS_ID]: 'BIGBOSS', [ADMIN_ID]: 'ADMIN' };

function ligneConversation(etat: Etat, surcharge: AnyRecord = {}): AnyRecord {
  return {
    id: CONV_ID,
    identifier: etat.identifier ?? 'mshy_team',
    title: 'Team',
    description: null,
    type: etat.type ?? 'group',
    avatar: null,
    banner: null,
    isActive: true,
    closedAt: etat.closedAt ?? null,
    communityId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    lastMessageAt: new Date('2026-01-03'),
    defaultWriteRole: 'everyone',
    isAnnouncementChannel: false,
    slowModeSeconds: 0,
    autoTranslateEnabled: true,
    encryptionMode: etat.encryptionMode ?? null,
    _count: { participants: 2 },
    conversationMessageStats: null,
    participants: PARTICIPANTS,
    ...surcharge,
  };
}

function fauxPrisma(etat: Etat = {}) {
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => (etat.existe === false ? null : ligneConversation(etat))),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async (args: { data: AnyRecord }) => ligneConversation(etat, args.data)),
    },
    user: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => ({ role: RANG_DE_PLATEFORME[args.where.id] ?? 'USER' })),
    },
    conversationShareLink: { updateMany: jest.fn(async () => ({ count: 0 })) },
    participant: {
      findFirst: jest.fn(async (args: { where: AnyRecord }) =>
        PARTICIPANTS.find((p) => p.userId === args.where.userId && (args.where.isActive === undefined || p.isActive === args.where.isActive)) ?? null
      ),
      findUnique: jest.fn(async () => ({ ...PARTICIPANTS[0], role: 'admin', user: null })),
      findMany: jest.fn(async () => PARTICIPANTS.filter((p) => p.isActive)),
      update: jest.fn(async (args: { data: AnyRecord }) => ({ ...PARTICIPANTS[0], ...args.data })),
    },
    adminAuditLog: { create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', ...args.data })) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

type FauxPrisma = ReturnType<typeof fauxPrisma>;

function fauxSocket() {
  const emissions: Array<{ rooms: string[]; event: string; payload: AnyRecord }> = [];
  const chain = (rooms: string[]): AnyRecord => ({
    to: (room: string) => chain([...rooms, room]),
    except: () => chain(rooms),
    emit: (event: string, payload: AnyRecord) => {
      emissions.push({ rooms, event, payload });
      return true;
    },
  });
  const io = {
    to: (room: string) => chain([room]),
    in: () => ({ fetchSockets: async () => [] }),
  };
  const manager = {
    getIO: () => io,
    invalidateParticipantCache: jest.fn(),
    endLiveLocationForDepartedMember: jest.fn(),
    endCallParticipationForDepartedMember: jest.fn(async () => undefined),
    endLiveLocationsForClosedConversation: jest.fn(),
  };
  return { handler: { getManager: () => manager }, manager, emissions };
}

async function monter(role: string, prisma: FauxPrisma = fauxPrisma()) {
  const socket = fauxSocket();
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown as FastifyInstance['prisma']);
  app.decorate('socketIOHandler', socket.handler as unknown as FastifyInstance['socketIOHandler']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as AnyRecord).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
      hasFullAccess: true,
    };
  });
  const { registerConversationSettingsSovereignRoutes } = await import('../../../routes/admin/conversation-settings-sovereign');
  await app.register(async (scope) => registerConversationSettingsSovereignRoutes(scope), { prefix: '/api/v1' });
  await app.ready();
  return { app, prisma, socket };
}

const patchConv = (app: FastifyInstance, payload: AnyRecord, id = CONV_ID) =>
  app.inject({ method: 'PATCH', url: `/api/v1/admin/conversations/${id}`, payload });

describe('PATCH /admin/conversations/:conversationId', () => {
  it('refuse un MODERATOR — il porte canManageConversations, pas le rang', async () => {
    const { app, prisma } = await monter('MODERATOR');
    const res = await patchConv(app, { title: 'X', reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un ADMIN sans motif (400 au schéma)', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchConv(app, { title: 'X' });
    expect(res.statusCode).toBe(400);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un motif de moins de dix caractères', async () => {
    const { app } = await monter('ADMIN');
    const res = await patchConv(app, { title: 'X', reason: 'court' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it.each([['type', 'direct'], ['encryptionMode', 'e2ee']])('refuse un champ hors de la liste (%s)', async (champ, valeur) => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchConv(app, { [champ]: valeur, reason: MOTIF });
    expect(res.statusCode).toBe(400);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse la conversation globale', async () => {
    const { app, prisma } = await monter('BIGBOSS', fauxPrisma({ identifier: 'meeshy', type: 'global' }));
    const res = await patchConv(app, { title: 'X', reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse l\'adresse littérale « meeshy »', async () => {
    const { app } = await monter('BIGBOSS');
    const res = await patchConv(app, { title: 'X', reason: MOTIF }, 'meeshy');
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse un réglage de hiérarchie sur un tête-à-tête', async () => {
    const { app, prisma } = await monter('ADMIN', fauxPrisma({ type: 'direct' }));
    const res = await patchConv(app, { slowModeSeconds: 10, reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse la traduction automatique sur une conversation chiffrée de bout en bout (400)', async () => {
    const { app, prisma } = await monter('ADMIN', fauxPrisma({ encryptionMode: 'e2ee' }));
    const res = await patchConv(app, { autoTranslateEnabled: true, reason: MOTIF });
    expect(res.statusCode).toBe(400);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 404 pour une conversation inexistante', async () => {
    const { app } = await monter('ADMIN', fauxPrisma({ existe: false }));
    const res = await patchConv(app, { title: 'X', reason: MOTIF });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('un corps sans champ rend l\'état courant, sans écrire ni tracer', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchConv(app, { reason: MOTIF });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: CONV_ID, title: 'Team' });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('écrit un titre assaini, l\'annonce aux participants ACTIFS et trace le geste', async () => {
    const { app, prisma, socket } = await monter('ADMIN');
    const res = await patchConv(app, { title: '<b>Nouveau</b> nom', reason: MOTIF });

    expect(res.statusCode).toBe(200);
    const ecrit = (prisma.conversation.update.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(ecrit.title).toBeDefined();
    expect(String(ecrit.title)).not.toContain('<b>');

    const annonce = socket.emissions.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(annonce?.rooms).toEqual([ROOMS.conversation(CONV_ID), ROOMS.user(MEMBER_ID), ROOMS.user(CREATOR_ID), ROOMS.user(BOSS_ID)]);
    expect(annonce?.payload).toMatchObject({ conversationId: CONV_ID, title: ecrit.title, updatedBy: { id: ADMIN_ID } });

    const trace = (prisma.adminAuditLog.create.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(trace).toMatchObject({ adminId: ADMIN_ID, entity: 'Conversation', entityId: CONV_ID });
    expect(JSON.parse(String(trace.metadata))).toEqual({ reason: MOTIF });
    expect(JSON.parse(String(trace.changes))).toMatchObject({ title: { before: 'Team', after: ecrit.title } });

    expect(res.json().data).toMatchObject({ id: CONV_ID, settings: { slowModeSeconds: 0 } });
    expect(res.json().data).not.toHaveProperty('participants');
    await app.close();
  });

  it('closed:true écrit closedAt/closedBy, éteint les liens de partage et annonce la fermeture', async () => {
    const { app, prisma, socket } = await monter('ADMIN');
    const res = await patchConv(app, { closed: true, reason: MOTIF });

    expect(res.statusCode).toBe(200);
    const ecrit = (prisma.conversation.update.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(ecrit.closedAt).toBeInstanceOf(Date);
    expect(ecrit.closedBy).toBe(ADMIN_ID);
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalled();
    expect(socket.emissions.some((e) => e.event === SERVER_EVENTS.CONVERSATION_CLOSED)).toBe(true);
    await app.close();
  });

  it('closed:true sur un fil DÉJÀ fermé ne réécrit ni la date ni l\'auteur de la fermeture', async () => {
    const { app, prisma, socket } = await monter('ADMIN', fauxPrisma({ closedAt: new Date('2026-02-01') }));
    await patchConv(app, { closed: true, title: 'Renommé', reason: MOTIF });
    const ecrit = (prisma.conversation.update.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(ecrit).not.toHaveProperty('closedAt');
    expect(ecrit).not.toHaveProperty('closedBy');
    expect(socket.emissions.some((e) => e.event === SERVER_EVENTS.CONVERSATION_CLOSED)).toBe(false);
    await app.close();
  });

  it('closed:false rouvre — closedAt et closedBy reviennent à null', async () => {
    const { app, prisma } = await monter('ADMIN');
    await patchConv(app, { closed: false, reason: MOTIF });
    const ecrit = (prisma.conversation.update.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(ecrit).toMatchObject({ closedAt: null, closedBy: null });
    await app.close();
  });

  it('isActive:false archive la conversation', async () => {
    const { app, prisma } = await monter('ADMIN');
    await patchConv(app, { isActive: false, reason: MOTIF });
    const ecrit = (prisma.conversation.update.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(ecrit).toEqual({ isActive: false });
    await app.close();
  });
});

describe('PATCH /admin/conversations/:conversationId/participants/:userId', () => {
  const patchRole = (app: FastifyInstance, userId: string, payload: AnyRecord) =>
    app.inject({ method: 'PATCH', url: `/api/v1/admin/conversations/${CONV_ID}/participants/${userId}`, payload });

  it('change le rang, diffuse participant:role-updated sans présence et trace sur la cible', async () => {
    const { app, prisma, socket } = await monter('ADMIN');
    const res = await patchRole(app, MEMBER_ID, { role: 'admin', reason: MOTIF });

    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pt-member' }, data: { role: 'admin' } }));
    const annonce = socket.emissions.find((e) => e.event === SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED);
    expect(annonce?.payload).toMatchObject({ conversationId: CONV_ID, userId: MEMBER_ID, newRole: 'admin', updatedBy: ADMIN_ID });
    expect(annonce?.payload.participant).not.toHaveProperty('isOnline');
    expect(socket.manager.invalidateParticipantCache).toHaveBeenCalledWith(MEMBER_ID, CONV_ID);
    const trace = (prisma.adminAuditLog.create.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(trace).toMatchObject({ entity: 'Conversation', entityId: CONV_ID, userId: MEMBER_ID });
    await app.close();
  });

  it('refuse de toucher au créateur (403)', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchRole(app, CREATOR_ID, { role: 'member', reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse de nommer quelqu\'un créateur (400 au schéma)', async () => {
    const { app } = await monter('ADMIN');
    const res = await patchRole(app, MEMBER_ID, { role: 'creator', reason: MOTIF });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rend 404 pour un participant inactif ou absent', async () => {
    const { app } = await monter('ADMIN');
    const res = await patchRole(app, GONE_ID, { role: 'admin', reason: MOTIF });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse un identifiant de membre malformé en 400, avant la garde de hiérarchie', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchRole(app, 'pas-un-objectid', { role: 'admin', reason: MOTIF });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un MODERATOR', async () => {
    const { app } = await monter('MODERATOR');
    const res = await patchRole(app, MEMBER_ID, { role: 'admin', reason: MOTIF });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse à un ADMIN de rétrograder un membre de rang supérieur (BIGBOSS) — hiérarchie de plateforme', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await patchRole(app, BOSS_ID, { role: 'member', reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/conversations/:conversationId/participants/:userId/remove', () => {
  const remove = (app: FastifyInstance, userId: string, payload: AnyRecord) =>
    app.inject({ method: 'POST', url: `/api/v1/admin/conversations/${CONV_ID}/participants/${userId}/remove`, payload });

  it('retire le membre : isActive:false + leftAt, fin d\'appartenance, effectif annoncé, trace', async () => {
    const { app, prisma, socket } = await monter('ADMIN');
    const res = await remove(app, MEMBER_ID, { reason: MOTIF });

    expect(res.statusCode).toBe(200);
    const ecrit = (prisma.participant.update.mock.calls[0] as unknown as [{ where: AnyRecord; data: AnyRecord }])[0];
    expect(ecrit.where).toEqual({ id: 'pt-member' });
    expect(ecrit.data.isActive).toBe(false);
    expect(ecrit.data.leftAt).toBeInstanceOf(Date);
    expect(socket.manager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(CONV_ID, MEMBER_ID);
    expect(socket.manager.invalidateParticipantCache).toHaveBeenCalledWith(MEMBER_ID, CONV_ID);
    expect(socket.emissions.some((e) => e.event === SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT)).toBe(true);
    const trace = (prisma.adminAuditLog.create.mock.calls[0] as unknown as [{ data: AnyRecord }])[0].data;
    expect(trace).toMatchObject({ entity: 'Conversation', entityId: CONV_ID, userId: MEMBER_ID });
    await app.close();
  });

  it('refuse de retirer le créateur (403)', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await remove(app, CREATOR_ID, { reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse la conversation globale (403)', async () => {
    const { app, prisma } = await monter('ADMIN', fauxPrisma({ identifier: 'meeshy', type: 'global' }));
    const res = await remove(app, MEMBER_ID, { reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse à un ADMIN de retirer un membre de rang supérieur (BIGBOSS)', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await remove(app, BOSS_ID, { reason: MOTIF });
    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un identifiant de membre malformé en 400, avant la garde de hiérarchie', async () => {
    const { app, prisma } = await monter('ADMIN');
    const res = await remove(app, 'pas-un-objectid', { reason: MOTIF });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse sans motif (400)', async () => {
    const { app } = await monter('ADMIN');
    const res = await remove(app, MEMBER_ID, {});
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
