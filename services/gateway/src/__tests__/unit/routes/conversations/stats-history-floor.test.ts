/**
 * `GET /conversations/:id/stats` (#17076) — **l'agrégat est borné par le
 * PLANCHER du lecteur**.
 *
 * La route n'avait que deux gardes — `resolveConversationId`, puis
 * `canAccessConversation` — et servait ensuite la ligne
 * `ConversationMessageStats`, qui agrège TOUTE la vie de la conversation. Un
 * inscrit entré aujourd'hui par un lien `allowViewHistory: false` y lisait donc
 * ce que le fil, la recherche, les fils de réponses et les traductions
 * partagées lui refusent tous : **quand la conversation a commencé** (le
 * `firstMessageAt` de chacun), **qui a écrit combien** (`participantStats`,
 * enrichi NOMINALEMENT) et **le volume de chaque journée passée**
 * (`dailyActivity`).
 *
 * ─── Pourquoi un agrégat PLAFONNÉ n'était pas une option ─────────────────────
 *
 * Aucun champ de cette charge n'est sûr sous plancher : `totalMessages` compte
 * l'avant, `dailyActivity` le date, `participantStats` l'attribue, les deux
 * distributions l'agrègent. Servir « le total, mais plafonné » laisserait
 * déduire le reste par soustraction dès que le lecteur connaît sa propre
 * fenêtre — ce qui est son cas par construction.
 *
 * ─── Et pourquoi pas un REFUS ────────────────────────────────────────────────
 *
 * Parce que la fenêtre d'un lecteur à plancher EST sa fenêtre de lecture : les
 * mêmes messages que `GET …/messages` lui sert déjà. Recalculer dessus ne
 * publie rien de neuf, et garde la feature pour cette population (dimension 13)
 * au lieu de la lui retirer.
 *
 * ─── Le témoin au rang nominal ne peut pas tomber ────────────────────────────
 *
 * Sans plancher, la règle juste et le défaut rendent le même verdict. Le témoin
 * qui MESURE est donc celui du lecteur planchéisé ; celui du créateur est le
 * témoin NÉGATIF, vert des deux côtés, et son rôle est d'interdire qu'on paie
 * le correctif en retirant la route à tout le monde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

import { registerStatsRoutes } from '../../../../routes/conversations/stats';
import { conversationMessageStatsService } from '../../../../services/ConversationMessageStatsService';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const OTHER_USER = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';

/** Le plancher du lecteur : il est arrivé ce jour-là, et le lien lui refuse l'avant. */
const FLOOR = new Date('2026-11-08T00:00:00.000Z');
const BEFORE_FLOOR = new Date('2026-03-04T09:15:00.000Z');
const AFTER_FLOOR = new Date('2026-11-08T10:20:00.000Z');

type FloorRow = { joinedAt: Date; historyVisibleFrom: Date | null; shareLinkId: string | null } | null;

/**
 * Les messages que la conversation PORTE — l'avant-plancher et l'après. Le
 * double de `message.findMany` applique lui-même la borne `createdAt.gte` que
 * la route passe : un double qui rendrait tout quelle que soit la requête
 * ferait passer le témoin sur une borne jamais envoyée (§ « un témoin de
 * projection assert sur la REQUÊTE »).
 */
const ALL_MESSAGES = [
  {
    content: 'les tout débuts',
    senderId: OTHER_USER,
    createdAt: BEFORE_FLOOR,
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { userId: OTHER_USER },
    attachments: [],
  },
  {
    content: 'bonjour à toi',
    senderId: OTHER_USER,
    createdAt: AFTER_FLOOR,
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { userId: OTHER_USER },
    attachments: [],
  },
];

function makePrisma(floorRow: FloorRow) {
  const findMany = jest.fn<any>().mockImplementation(async (args: any) => {
    const gte: Date | undefined = args?.where?.createdAt?.gte;
    return gte ? ALL_MESSAGES.filter((m) => m.createdAt.getTime() >= gte.getTime()) : ALL_MESSAGES;
  });

  return {
    prisma: {
      participant: { findFirst: jest.fn<any>().mockResolvedValue(floorRow) },
      conversationShareLink: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'lien', allowViewHistory: false }),
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'lien', allowViewHistory: false }]),
      },
      conversationMessageStats: {
        findUnique: jest.fn<any>().mockResolvedValue({
          conversationId: CONV_ID,
          totalMessages: 2,
          totalWords: 6,
          totalCharacters: 29,
          textMessages: 2,
          imageCount: 0,
          audioCount: 0,
          videoCount: 0,
          fileCount: 0,
          locationCount: 0,
          participantStats: {
            [OTHER_USER]: {
              messageCount: 2,
              wordCount: 6,
              characterCount: 29,
              imageCount: 0,
              audioCount: 0,
              videoCount: 0,
              firstMessageAt: BEFORE_FLOOR.toISOString(),
              lastMessageAt: AFTER_FLOOR.toISOString(),
            },
          },
          dailyActivity: { '2026-03-04': 1, '2026-11-08': 1 },
          hourlyDistribution: { '9': 1, '10': 1 },
          languageDistribution: { fr: 2 },
          updatedAt: AFTER_FLOOR,
        }),
      },
      message: { findMany },
      user: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: OTHER_USER, username: 'alix', displayName: 'Alix', avatar: null },
        ]),
      },
    },
    findMany,
  };
}

async function buildApp(floorRow: FloorRow): Promise<{ app: FastifyInstance; findMany: jest.Mock<any> }> {
  const { prisma, findMany } = makePrisma(floorRow);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  registerStatsRoutes(app, prisma as any, requiredAuth as any);
  await app.ready();
  return { app, findMany };
}

const url = `/conversations/${CONV_ID}/stats`;

/** Le lecteur planchéisé : entré par lien, l'avant lui est refusé. */
const FLOORED: FloorRow = { joinedAt: FLOOR, historyVisibleFrom: FLOOR, shareLinkId: 'lien' };

describe('l’agrégat de statistiques est borné par le plancher du lecteur (#17076)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    conversationMessageStatsService.invalidate(CONV_ID);
  });

  it('un lecteur à plancher ne lit AUCUNE date antérieure à son arrivée', async () => {
    const { app } = await buildApp(FLOORED);
    try {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      const { data } = res.json();

      const dates = [
        ...data.dailyActivity.map((d: { date: string }) => d.date),
        ...data.participantStats.flatMap((p: { firstMessageAt: string | null; lastMessageAt: string | null }) =>
          [p.firstMessageAt, p.lastMessageAt].filter(Boolean),
        ),
      ];
      const floorDay = FLOOR.toISOString().slice(0, 10);
      expect(dates.filter((d: string) => d.slice(0, 10) < floorDay)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('ses compteurs ne comptent que sa fenêtre — pas de total plafonné dont on déduirait l’avant', async () => {
    const { app } = await buildApp(FLOORED);
    try {
      const { data } = (await app.inject({ method: 'GET', url })).json();
      expect(data.totalMessages).toBe(1);
      expect(data.participantStats).toHaveLength(1);
      expect(data.participantStats[0].messageCount).toBe(1);
      expect(data.languageDistribution).toEqual([{ language: 'fr', count: 1 }]);
    } finally {
      await app.close();
    }
  });

  it('la borne est bien passée à la REQUÊTE, pas appliquée après coup', async () => {
    const { app, findMany } = await buildApp(FLOORED);
    try {
      await app.inject({ method: 'GET', url });
      expect(findMany).toHaveBeenCalled();
      const [args] = findMany.mock.calls[0] as [{ where: { conversationId: string; deletedAt: null; createdAt?: { gte?: Date } } }];
      expect(args.where.createdAt?.gte?.toISOString()).toBe(FLOOR.toISOString());
      expect(args.where).toMatchObject({ conversationId: CONV_ID, deletedAt: null });
    } finally {
      await app.close();
    }
  });

  it('une lecture planchéisée n’ÉCRIT rien — la ligne autoritative reste celle de tous', async () => {
    const { prisma } = makePrisma(FLOORED);
    const upsert = jest.fn<any>();
    (prisma.conversationMessageStats as any).upsert = upsert;
    (prisma.conversationMessageStats as any).update = jest.fn<any>();
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerStatsRoutes(app, prisma as any, (async (req: FastifyRequest) => {
      (req as any).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
    }) as any);
    await app.ready();
    try {
      conversationMessageStatsService.invalidate(CONV_ID);
      await app.inject({ method: 'GET', url });
      expect(upsert).not.toHaveBeenCalled();
      expect((prisma.conversationMessageStats as any).update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  /**
   * Témoin NÉGATIF — vert des DEUX côtés par construction, et c'est dit ici
   * pour qu'on ne le lise pas comme une mesure : sans plancher, le défaut et la
   * règle juste rendent la même charge. Son rôle est d'interdire qu'on paie le
   * correctif en retirant la route à tout le monde, ou en la faisant passer par
   * un recalcul pour un lecteur qui n'en a pas besoin.
   */
  it('sans plancher, la charge reste celle de la ligne agrégée, sans recalcul', async () => {
    const { app, findMany } = await buildApp(null);
    try {
      const { data } = (await app.inject({ method: 'GET', url })).json();
      expect(data.totalMessages).toBe(2);
      expect(data.participantStats[0].firstMessageAt).toBe(BEFORE_FLOOR.toISOString());
      expect(findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  /**
   * Fail-CLOSED, et c'est l'inverse de la posture de `personalHistoryFilter`
   * (« cacher est une courtoisie, montrer est le produit ») : ici le plancher
   * est une garde de CONFIDENTIALITÉ. Un plancher illisible ne doit pas servir
   * l'agrégat de tous — la route échoue en montrant MOINS.
   */
  it('un plancher illisible ne sert RIEN — 500, jamais l’agrégat complet', async () => {
    const { prisma } = makePrisma(FLOORED);
    prisma.participant.findFirst = jest.fn<any>().mockRejectedValue(new Error('participant illisible'));
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerStatsRoutes(app, prisma as any, (async (req: FastifyRequest) => {
      (req as any).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
    }) as any);
    await app.ready();
    try {
      conversationMessageStatsService.invalidate(CONV_ID);
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(500);
      expect(res.json().data).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  /**
   * Le lecteur SANS COMPTE se trouve par `Participant.id`, jamais par la
   * colonne `userId` — le `CLAUDE.md` de la passerelle en fait une règle, et le
   * symptôme d'une erreur de colonne est une liste VIDE, donc un plancher NUL,
   * donc l'agrégat de tous servi au lecteur le plus restreint. La route est en
   * `allowAnonymous: false`, mais un `authContext` anonyme y arrive par un
   * invité INSCRIT dont le middleware porte un `participantId`.
   */
  it('le plancher d’un lecteur adressé par participantId est cherché sur la bonne COLONNE', async () => {
    const { prisma } = makePrisma(FLOORED);
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerStatsRoutes(app, prisma as any, (async (req: FastifyRequest) => {
      (req as any).authContext = {
        type: 'anonymous',
        isAuthenticated: true,
        isAnonymous: true,
        userId: PARTICIPANT_ID,
        participantId: PARTICIPANT_ID,
      };
    }) as any);
    await app.ready();
    try {
      conversationMessageStatsService.invalidate(CONV_ID);
      await app.inject({ method: 'GET', url });
      const [args] = (prisma.participant.findFirst as jest.Mock<any>).mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(args.where).toMatchObject({ id: PARTICIPANT_ID, conversationId: CONV_ID });
      expect(args.where).not.toHaveProperty('userId');
    } finally {
      await app.close();
    }
  });
});
