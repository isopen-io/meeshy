/**
 * Une conversation SANS titre se nomme par ses membres — au rang d'administration seulement
 * (#8876, règle R1).
 *
 * Le classement, un signalement et le journal d'audit nommaient une conversation directe
 * « Sans titre » : la console ne savait pas dire « Awa et Jean ». Les trois servent désormais
 * trois membres actifs au plus et l'effectif — mais qui parle à qui EST l'inventaire des
 * conversations (directive 2026-09-16), réservé à BIGBOSS et ADMIN. Pour MODERATOR, AUDIT et
 * tout autre rôle les clés sont ABSENTES, et la base n'est même pas interrogée.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

import { systemRankingsRoutes } from '../../../../routes/admin/system-rankings';
import { enrichReports } from '../../../../routes/admin/reports-enrichment';
import { resolveAuditTargets } from '../../../../routes/admin/audit-logs-targets';
import {
  loadConversationNamePreviews,
  NAME_PREVIEW_MEMBERS,
} from '../../../../routes/admin/conversation-name-preview';

const ACTOR = '507f1f77bcf86cd799439011';
const DIRECT = '507f1f77bcf86cd799439031';
const TITLED = '507f1f77bcf86cd799439032';
const MESSAGE = '507f1f77bcf86cd799439061';

type Row = Record<string, unknown>;

const awa = { displayName: 'Awa Diop', user: { username: 'awa', displayName: 'Awa Diop' } };
const jean = { displayName: 'Jean', user: { username: 'jean', displayName: null } };

/** Le double HONORE `where.id.in` : il ne rend que les conversations demandées. */
function conversationFindMany() {
  const corpus: Row[] = [
    {
      id: DIRECT,
      identifier: 'mshy_direct',
      title: null,
      type: 'direct',
      avatar: null,
      participants: [awa, jean],
      _count: { participants: 2 },
    },
    {
      id: TITLED,
      identifier: 'mshy_famille',
      title: 'Famille',
      type: 'group',
      avatar: null,
      participants: [awa],
      _count: { participants: 9 },
    },
  ];
  return jest.fn<any>(async (args: { where?: { id?: { in?: string[] } } }) => {
    const wanted = args.where?.id?.in;
    return corpus.filter((row) => wanted === undefined || wanted.includes(row.id as string));
  });
}

function makePrisma() {
  return {
    conversation: { findMany: conversationFindMany() },
    message: {
      findMany: jest.fn<any>(async () => [
        {
          id: MESSAGE,
          content: 'Salut',
          conversationId: DIRECT,
          deletedAt: null,
          isViewOnce: false,
          isBlurred: false,
          expiresAt: null,
          effectFlags: 0,
          encryptionMode: null,
          sender: { id: 'p1', displayName: 'Awa', avatar: null, user: { id: ACTOR, username: 'awa', displayName: 'Awa Diop', avatar: null } },
        },
      ]),
      groupBy: jest.fn<any>(async () => [{ conversationId: DIRECT, _count: { id: 40 } }, { conversationId: TITLED, _count: { id: 9 } }]),
    },
    user: { findMany: jest.fn<any>(async () => []) },
    community: { findMany: jest.fn<any>(async () => []) },
    post: { findMany: jest.fn<any>(async () => []) },
    postComment: { findMany: jest.fn<any>(async () => []) },
    sound: { findMany: jest.fn<any>(async () => []) },
    conversationShareLink: { findMany: jest.fn<any>(async () => []) },
    adminBroadcast: { findMany: jest.fn<any>(async () => []) },
    report: { findMany: jest.fn<any>(async () => []) },
    trackingLink: { findMany: jest.fn<any>(async () => []) },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
  } as any;
}

describe('loadConversationNamePreviews — la source unique', () => {
  it('ne lit que les conversations sans titre, trois membres actifs au plus, et rend l’effectif actif', async () => {
    const prisma = makePrisma();
    const previews = await loadConversationNamePreviews(
      prisma,
      [
        { id: DIRECT, title: null },
        { id: TITLED, title: 'Famille' },
      ],
      { allowed: true }
    );

    expect([...previews.keys()]).toEqual([DIRECT]);
    expect(previews.get(DIRECT)).toEqual({
      participants: [
        { displayName: 'Awa Diop', username: 'awa' },
        { displayName: 'Jean', username: 'jean' },
      ],
      total: 2,
    });
    const args = prisma.conversation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { in: [DIRECT] } });
    expect(args.select.participants).toMatchObject({ where: { isActive: true }, take: NAME_PREVIEW_MEMBERS });
    expect(NAME_PREVIEW_MEMBERS).toBe(3);
    expect(args.select._count).toEqual({ select: { participants: { where: { isActive: true } } } });
    expect(Object.keys(args.select.participants.select).sort()).toEqual(['displayName', 'user']);
  });

  it('un titre blanc compte comme « sans titre » ; une liste de conversations titrées n’interroge pas la base', async () => {
    const prisma = makePrisma();
    expect((await loadConversationNamePreviews(prisma, [{ id: DIRECT, title: '   ' }], { allowed: true })).size).toBe(1);

    prisma.conversation.findMany.mockClear();
    expect((await loadConversationNamePreviews(prisma, [{ id: TITLED, title: 'Famille' }], { allowed: true })).size).toBe(0);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('sans le rang d’administration, la carte est vide et la base n’est pas interrogée', async () => {
    const prisma = makePrisma();
    const previews = await loadConversationNamePreviews(prisma, [{ id: DIRECT, title: null }], { allowed: false });

    expect(previews.size).toBe(0);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('un membre anonyme — sans compte — est nommé par son nom de participant, sans pseudo', async () => {
    const prisma = makePrisma();
    prisma.conversation.findMany.mockResolvedValue([
      { id: DIRECT, participants: [{ displayName: ' Invitée ', user: null }], _count: { participants: 1 } },
    ]);
    const previews = await loadConversationNamePreviews(prisma, [{ id: DIRECT, title: null }], { allowed: true });

    expect(previews.get(DIRECT)?.participants).toEqual([{ displayName: 'Invitée', username: null }]);
  });
});

describe('GET /admin/ranking — le classement nomme une conversation directe par ses membres', () => {
  beforeEach(() => jest.clearAllMocks());

  async function build(role: string): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
    const prisma = makePrisma();
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: ACTOR,
        registeredUser: { id: ACTOR, role, username: 'acteur' },
      };
    });
    await app.register(systemRankingsRoutes);
    await app.ready();
    return { app, prisma };
  }

  const rankings = async (app: FastifyInstance, query: string) =>
    (await app.inject({ method: 'GET', url: `/ranking?${query}` })).json().data.rankings as Row[];

  it.each(['ADMIN', 'BIGBOSS'])('%s reçoit participants et total pour une conversation sans titre, rien pour une titrée', async (role) => {
    const { app } = await build(role);
    const rows = await rankings(app, 'entityType=conversations&criterion=message_count');

    const direct = rows.find((row) => row.id === DIRECT);
    const titled = rows.find((row) => row.id === TITLED);
    expect(direct?.participants).toEqual([
      { displayName: 'Awa Diop', username: 'awa' },
      { displayName: 'Jean', username: 'jean' },
    ]);
    expect(direct?.total).toBe(2);
    expect(titled).not.toHaveProperty('participants');
    expect(titled).not.toHaveProperty('total');
    await app.close();
  });

  it.each(['MODERATOR', 'AUDIT'])('%s ne reçoit AUCUNE clé de membres, et la base n’est pas interrogée pour eux', async (role) => {
    const { app, prisma } = await build(role);
    const rows = await rankings(app, 'entityType=conversations&criterion=message_count');

    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('participants');
      expect(row).not.toHaveProperty('total');
    }
    const previewQueries = prisma.conversation.findMany.mock.calls.filter(
      ([args]: [{ select?: { participants?: unknown } }]) => args.select?.participants !== undefined
    );
    expect(previewQueries).toHaveLength(0);
    await app.close();
  });
});

describe('enrichReports — le signalement d’un message dit dans QUELLE conversation, par ses membres', () => {
  const report = { reportedType: 'message', reportedEntityId: MESSAGE, reporterId: null, moderatorId: null };

  it('au rang d’administration : la conversation sans titre porte participants et total', async () => {
    const [served] = await enrichReports(makePrisma(), [report], { canSeeExcerpt: true, canSeeConversationMembers: true });

    expect(served.reportedEntity?.conversation).toEqual({ id: DIRECT, title: null });
    expect(served.reportedEntity?.participants).toEqual([
      { displayName: 'Awa Diop', username: 'awa' },
      { displayName: 'Jean', username: 'jean' },
    ]);
    expect(served.reportedEntity?.total).toBe(2);
  });

  it('pour MODERATOR : les clés sont absentes, la conversation reste désignée par son id', async () => {
    const prisma = makePrisma();
    const [served] = await enrichReports(prisma, [report], { canSeeExcerpt: true, canSeeConversationMembers: false });

    expect(served.reportedEntity?.conversation).toEqual({ id: DIRECT, title: null });
    expect(served.reportedEntity).not.toHaveProperty('participants');
    expect(served.reportedEntity).not.toHaveProperty('total');
    const previewQueries = prisma.conversation.findMany.mock.calls.filter(
      ([args]: [{ select?: { participants?: unknown } }]) => args.select?.participants !== undefined
    );
    expect(previewQueries).toHaveLength(0);
  });

  it('un signalement de CONVERSATION sans titre est nommé de la même façon', async () => {
    const [served] = await enrichReports(
      makePrisma(),
      [{ reportedType: 'conversation', reportedEntityId: DIRECT, reporterId: null, moderatorId: null }],
      { canSeeExcerpt: false, canSeeConversationMembers: true }
    );

    expect(served.reportedEntity?.label).toBeNull();
    expect(served.reportedEntity?.total).toBe(2);
    expect(served.reportedEntity?.participants?.[0]).toEqual({ displayName: 'Awa Diop', username: 'awa' });
  });
});

describe('resolveAuditTargets — la cible Conversation sans titre est nommée par ses membres', () => {
  const refs = [
    { entity: 'Conversation', entityId: DIRECT },
    { entity: 'Conversation', entityId: TITLED },
  ];

  it('au rang d’administration, la conversation sans titre porte participants et total', async () => {
    const named = await resolveAuditTargets(makePrisma(), refs, new Map(), { canSeeConversationMembers: true });

    expect(named.get(`Conversation:${DIRECT}`)).toMatchObject({ label: null, total: 2 });
    expect(named.get(`Conversation:${DIRECT}`)?.participants).toHaveLength(2);
    expect(named.get(`Conversation:${TITLED}`)).toEqual({ label: 'Famille', secondary: 'group' });
  });

  it('pour AUDIT, rien : ni participants ni total', async () => {
    const named = await resolveAuditTargets(makePrisma(), refs, new Map(), { canSeeConversationMembers: false });

    expect(named.get(`Conversation:${DIRECT}`)).toEqual({ label: null, secondary: 'direct' });
  });
});
