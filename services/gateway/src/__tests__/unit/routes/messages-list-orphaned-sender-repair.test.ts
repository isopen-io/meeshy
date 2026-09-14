/**
 * #6501 — `GET /conversations/:id/messages` : un message dont l'expéditeur a
 * disparu ne rend plus la conversation illisible.
 *
 * Le 2026-09-14, « Meeshy Global » ne s'ouvrait plus sur staging : onze avis
 * d'arrivée laissés par un script de preuve pointaient vers des `Participant`
 * effacés, et Prisma rejetait la page ENTIÈRE (« Inconsistent query result:
 * Field sender is required to return data, got `null` instead »), servie en
 * 500 « Error retrieving messages ».
 *
 * Le double Prisma de ce fichier fait ce que fait Prisma : il JOINT
 * l'expéditeur de chaque ligne lue avec `select.sender`, et rejette toute la
 * lecture dès qu'il en manque un. La réparation qui tourne est la VRAIE, sur une
 * base en mémoire qui interprète ses pipelines (`helpers/orphaned-sender-db.ts`)
 * — le témoin lit donc ce que la RÉPONSE sert, jamais la forme d'un appel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]) }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { JOIN_NOTICE_KIND } from '@meeshy/shared/utils/join-notice';
import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import {
  makeOrphanedSenderDb,
  orphanedSenderPrismaError,
  type OrphanDbMessage,
  type OrphanedSenderDb,
} from '../../helpers/orphaned-sender-db';

const CONV_ID = '507f1f77bcf86cd799439501';
const USER_ID = '507f1f77bcf86cd799439522';
const MEMBER_ID = '507f1f77bcf86cd799439533';
const MEMBER_USER_ID = '507f1f77bcf86cd799439534';
const GHOST_ID = '507f1f77bcf86cd799439544';

const M_OK = '507f1f77bcf86cd799439601';
const M_ORPHELIN = '507f1f77bcf86cd799439602';
const M_AVIS = '507f1f77bcf86cd799439603';

function ligne(id: string, senderId: string, createdAt: Date, extra: Record<string, unknown> = {}): OrphanDbMessage {
  return {
    id,
    clientMessageId: null,
    conversationId: CONV_ID,
    senderId,
    content: `texte ${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    pinnedAt: null,
    pinnedBy: null,
    reactionSummary: {},
    reactionCount: 0,
    isEncrypted: false,
    encryptionMode: null,
    translations: {},
    metadata: null,
    validatedMentions: [],
    createdAt,
    updatedAt: createdAt,
    replyTo: null,
    attachments: [],
    _count: { reactions: 0, replies: 0 },
    ...extra,
  };
}

const MEMBRE = {
  id: MEMBER_ID,
  conversationId: CONV_ID,
  userId: MEMBER_USER_ID,
  type: 'user',
  displayName: 'Alice',
  avatar: null,
  isOnline: false,
  lastActiveAt: null,
  sessionTokenHash: null,
  user: {
    id: MEMBER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null,
    isOnline: false, lastActiveAt: null, firstName: null, lastName: null,
  },
};

const avisDArrivee = (id: string, createdAt: Date) =>
  ligne(id, GHOST_ID, createdAt, {
    messageSource: 'system',
    messageType: 'system',
    content: 'Preuve a rejoint la conversation',
    metadata: { kind: JOIN_NOTICE_KIND, participantId: GHOST_ID, displayName: 'Preuve', isAnonymous: false, viaShareLink: false },
  });

function champCorrespond(valeur: unknown, contrainte: unknown): boolean {
  if (contrainte === null) return valeur === null || valeur === undefined;
  if (contrainte instanceof Date) return valeur instanceof Date && valeur.getTime() === contrainte.getTime();
  if (typeof contrainte !== 'object') return valeur === contrainte;
  const c = contrainte as Record<string, unknown>;
  if ('in' in c) return (c.in as unknown[]).includes(valeur);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(valeur);
  const bornes = ['gte', 'gt', 'lt', 'lte'];
  if (bornes.some((borne) => borne in c)) {
    if (!(valeur instanceof Date)) return false;
    const t = valeur.getTime();
    if (c.gte instanceof Date && t < c.gte.getTime()) return false;
    if (c.gt instanceof Date && t <= c.gt.getTime()) return false;
    if (c.lt instanceof Date && t >= c.lt.getTime()) return false;
    if (c.lte instanceof Date && t > c.lte.getTime()) return false;
    return true;
  }
  throw new Error(`double de route : contrainte non supportée ${JSON.stringify(contrainte)}`);
}

function correspond(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([cle, contrainte]) => {
    if (cle === 'AND') return (contrainte as Record<string, unknown>[]).every((w) => correspond(row, w));
    if (cle === 'OR') return (contrainte as Record<string, unknown>[]).some((w) => correspond(row, w));
    if (cle === 'NOT') return !correspond(row, contrainte as Record<string, unknown>);
    return champCorrespond(row[cle], contrainte);
  });
}

function projette(row: any, select: any): any {
  if (!select) return row;
  return Object.fromEntries(
    Object.entries(select).flatMap(([cle, v]) => {
      const val = row[cle];
      if (!v || val === undefined) return [];
      const sous = (v as any).select;
      if (v === true || !sous) return [[cle, val]];
      return [[cle, Array.isArray(val) ? val.map((r: any) => projette(r, sous)) : val ? projette(val, sous) : val]];
    })
  );
}

type Scenario = {
  readonly messages: readonly OrphanDbMessage[];
  /** La lecture de la page rejette TOUJOURS (erreur étrangère, ou orphelin irréparable). */
  readonly echecPersistant?: () => Error;
};

function monter(scenario: Scenario): { app: FastifyInstance; db: OrphanedSenderDb; lectures: jest.Mock<any> } {
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  const db = makeOrphanedSenderDb({
    conversations: [{ id: CONV_ID, lastMessageAt: new Date('2026-09-14T05:00:00.000Z'), createdAt: new Date('2026-01-01') }],
    participants: [MEMBRE],
    messages: scenario.messages,
  });

  const lectures = jest.fn<any>(async (args: any) => {
    const lignes = db.state.messages
      .filter((row) => correspond(row, args?.where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(args?.skip ?? 0, args?.take ? (args?.skip ?? 0) + args.take : undefined);
    if (!args?.select?.sender) return lignes.map((row) => projette(row, args?.select));
    if (scenario.echecPersistant) throw scenario.echecPersistant();
    return lignes.map(db.withSender).map((row) => projette(row, args.select));
  });

  const prisma: any = {
    ...db.prisma,
    participant: {
      ...db.prisma.participant,
      findFirst: jest.fn(async () => ({
        id: 'reader-part-id',
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: { role: 'USER' },
      })),
    },
    conversationShareLink: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    message: {
      ...db.prisma.message,
      findMany: lectures,
      count: jest.fn(async (args: any) => db.state.messages.filter((row) => correspond(row, args?.where)).length),
    },
    user: {
      findFirst: jest.fn(async () => ({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      })),
    },
    attachmentStatusEntry: { findMany: jest.fn(async () => []) },
    conversationReadCursor: { updateMany: jest.fn(async () => ({ count: 0 })), findMany: jest.fn(async () => []) },
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;
  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  return { app, db, lectures };
}

async function lire(scenario: Scenario) {
  const monte = monter(scenario);
  await monte.app.ready();
  try {
    const res = await monte.app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    return { statut: res.statusCode, corps: JSON.parse(res.payload), ...monte };
  } finally {
    await monte.app.close();
  }
}

const lecturesAvecExpediteur = (lectures: jest.Mock<any>) =>
  lectures.mock.calls.filter(([args]) => Boolean((args as any)?.select?.sender)).length;

describe('#6501 — la liste des messages survit à un expéditeur disparu', () => {
  it('sert le message orphelin sous « Compte supprimé » : la conversation est réparée, la lecture rejouée', async () => {
    const { statut, corps, lectures } = await lire({
      messages: [
        ligne(M_OK, MEMBER_ID, new Date('2026-09-14T03:00:00.000Z')),
        ligne(M_ORPHELIN, GHOST_ID, new Date('2026-09-14T04:00:00.000Z')),
      ],
    });

    expect(statut).toBe(200);
    expect(corps.data.map((m: any) => m.id).sort()).toEqual([M_OK, M_ORPHELIN].sort());
    expect(corps.data.find((m: any) => m.id === M_ORPHELIN).sender.displayName).toBe('Compte supprimé');
    expect(lecturesAvecExpediteur(lectures)).toBe(2);
  });

  it("l'avis d'arrivée d'un participant effacé disparaît du fil au lieu de le rendre illisible", async () => {
    const { statut, corps } = await lire({
      messages: [
        ligne(M_OK, MEMBER_ID, new Date('2026-09-14T03:00:00.000Z')),
        avisDArrivee(M_AVIS, new Date('2026-09-14T04:00:00.000Z')),
      ],
    });

    expect(statut).toBe(200);
    expect(corps.data.map((m: any) => m.id)).toEqual([M_OK]);
  });

  it('une erreur ÉTRANGÈRE reste un 500, et ne déclenche aucune réparation', async () => {
    const { statut, db, lectures } = await lire({
      messages: [ligne(M_ORPHELIN, GHOST_ID, new Date('2026-09-14T04:00:00.000Z'))],
      echecPersistant: () => new Error('connection reset'),
    });

    expect(statut).toBe(500);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
    expect(lecturesAvecExpediteur(lectures)).toBe(1);
  });

  it('pas de boucle : une lecture qui échoue ENCORE après réparation reste un 500', async () => {
    const { statut, lectures } = await lire({
      messages: [ligne(M_ORPHELIN, GHOST_ID, new Date('2026-09-14T04:00:00.000Z'))],
      echecPersistant: orphanedSenderPrismaError,
    });

    expect(statut).toBe(500);
    expect(lecturesAvecExpediteur(lectures)).toBe(2);
  });
});
