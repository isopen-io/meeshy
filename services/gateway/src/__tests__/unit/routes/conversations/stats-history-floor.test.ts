/**
 * #17076 — `GET /conversations/:id/stats` servait l'historique AGRÉGÉ, NOMMÉ et
 * DATÉ sans plancher d'historique.
 *
 * La route n'avait que deux gardes — `resolveConversationId`, puis
 * `canAccessConversation` — et aucune occurrence de `historyFloor`,
 * `personalHistoryFilter` ni d'un plancher de rang. Ce qu'elle servait, pour
 * toute la vie de la conversation : `dailyActivity` (une ligne par jour depuis
 * la création), et `participantStats` enrichi NOMINALEMENT (username,
 * displayName, avatar) portant par personne son volume, son `firstMessageAt` et
 * son `lastMessageAt`.
 *
 * Un inscrit entré aujourd'hui par un lien `allowViewHistory: false` a un
 * plancher d'historique à son arrivée, que le fil, la recherche, les fils de
 * réponses et les traductions partagées respectent TOUS. Cette porte-ci lui
 * disait **quand la conversation a commencé, qui a écrit combien, et le volume
 * de chaque journée passée.** Fuite ACTIVE, et deux clients livrés l'ouvrent
 * (`ConversationAnalysisService.byIdStats` du SDK iOS,
 * `ConversationStatsViewModel` sur Android).
 *
 * > Le dépôt admet qu'« un agrégat sans identité (« N en ligne ») n'est pas
 * > visé ». Ces chiffres-ci sont NOMMÉS, DATÉS et ATTRIBUÉS : ils décrivent
 * > exactement l'historique qu'on refuse de servir message par message.
 *
 * Deux niveaux, parce que le défaut vit entre les deux :
 *
 *  1. la ROUTE résout-elle le plancher du lecteur et le passe-t-elle ? Un témoin
 *     posé sur le 200 ou sur la charge d'un créateur ne peut pas tomber — au
 *     rang nominal (pas de plancher) l'ancienne règle et la nouvelle rendent le
 *     même verdict (§ un témoin de rang s'écrit sur un rang AUTRE que le
 *     premier) ;
 *  2. le SERVICE agrège-t-il vraiment sur la fenêtre du lecteur ? C'est là que
 *     « plafonner » et « recalculer » se séparent : un agrégat plafonné
 *     laisserait déduire le reste par soustraction.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();
const mockGetStats = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as Record<string, unknown>),
  conversationMessageStatsService: { getStats: (...args: any[]) => mockGetStats(...args) },
}));

import { registerStatsRoutes } from '../../../../routes/conversations/stats';
import { ConversationMessageStatsService } from '../../../../services/ConversationMessageStatsService';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const OLD_TIMER_ID = '507f1f77bcf86cd799439033';
const FLOOR = new Date('2026-11-08T00:00:00.000Z');

// ── 1. La ROUTE résout le plancher du lecteur ─────────────────────────────

function makeRoutePrisma(participantRow: Record<string, unknown> | null) {
  return {
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(participantRow) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'registered',
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  registerStatsRoutes(app, prisma as any, requiredAuth as any);
  await app.ready();
  return app;
}

describe('GET …/stats — la route passe le plancher du LECTEUR (#17076)', () => {
  beforeEach(() => {
    // `mock.calls[0]` est lu par chaque témoin : sans remise à zéro, le second
    // inspecte l'appel du PREMIER et atteste un verdict qui n'est pas le sien.
    mockResolveConversationId.mockReset();
    mockCanAccessConversation.mockReset();
    mockGetStats.mockReset();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetStats.mockResolvedValue({ conversationId: CONV_ID, totalMessages: 0, participantStats: {} });
  });

  it('un participant BORNÉ par `historyVisibleFrom` fait agréger sur SA fenêtre', async () => {
    const app = await buildApp(
      makeRoutePrisma({
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: FLOOR,
        permissions: null,
        anonymousSession: null,
        user: { role: 'USER' },
      })
    );

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });

    expect(res.statusCode).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetStats.mock.calls[0][2]).toEqual({ historyFloor: FLOOR });
    await app.close();
  });

  it('un membre SANS plancher agrège tout, comme avant', async () => {
    // Mode d'échec du correctif : un plancher inventé priverait de statistiques
    // toute la population nominale, et aucun témoin de rang 1 ne le verrait.
    const app = await buildApp(
      makeRoutePrisma({
        role: 'creator',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: { role: 'USER' },
      })
    );

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });

    expect(res.statusCode).toBe(200);
    expect(mockGetStats.mock.calls[0][2]).toEqual({ historyFloor: null });
    await app.close();
  });

  it('un plancher ILLISIBLE ne sert rien — fail-CLOSED', async () => {
    // `loadReaderHistoryFloor` PROPAGE ses erreurs, et `historyFloor.ts` écrit
    // pourquoi : « un plancher illisible est un CONTRÔLE D'ACCÈS illisible, et la
    // seule dégradation sûre est de ne rien servir ». Un `catch` qui servirait
    // l'agrégat complet ferait de la panne la porte la plus ouverte du dépôt.
    const prisma = makeRoutePrisma(null);
    prisma.participant.findFirst.mockRejectedValue(new Error('mongo down'));
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });

    expect(res.statusCode).toBe(500);
    expect(mockGetStats).not.toHaveBeenCalled();
    await app.close();
  });
});

// ── 2. Le SERVICE agrège sur la fenêtre, il ne plafonne pas ───────────────

/**
 * Deux journées, deux auteurs : l'une AVANT le plancher, l'autre après. Un
 * agrégat « plafonné » servirait les deux et retrancherait un total ; celui-ci
 * ne doit JAMAIS avoir vu la première.
 */
const MESSAGES = [
  {
    content: 'le secret de la fondation',
    senderId: 'p-old',
    createdAt: new Date('2026-03-04T09:00:00.000Z'),
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { userId: OLD_TIMER_ID },
    attachments: [],
  },
  {
    content: 'bonjour, je viens d arriver',
    senderId: 'p-new',
    createdAt: new Date('2026-11-08T09:00:00.000Z'),
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { userId: USER_ID },
    attachments: [],
  },
];

function makeServicePrisma() {
  const findMany = jest.fn<any>().mockImplementation(({ where }: any) =>
    Promise.resolve(
      MESSAGES.filter((m) => {
        const gte = where?.createdAt?.gte as Date | undefined;
        return !gte || m.createdAt >= gte;
      })
    )
  );
  return {
    message: { findMany },
    conversationMessageStats: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockImplementation((args: any) => ({ conversationId: CONV_ID, ...args.create })),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

describe('ConversationMessageStatsService — agrégation BORNÉE par le plancher', () => {
  it('sous plancher, rien d\'antérieur n\'est nommé, daté ni compté', async () => {
    const service = new (ConversationMessageStatsService as any)();
    const prisma = makeServicePrisma();

    const stats = await service.getStats(prisma, CONV_ID, { historyFloor: FLOOR });

    // Le total est celui de la FENÊTRE, pas un plafond sur le total réel.
    expect(stats.totalMessages).toBe(1);

    // L'auteur d'avant n'existe pas pour ce lecteur : ni son nom, ni son volume.
    expect(Object.keys(stats.participantStats)).toEqual([USER_ID]);
    expect(stats.participantStats[OLD_TIMER_ID]).toBeUndefined();

    // Aucune date antérieure au plancher, nulle part dans la charge servie.
    expect(Object.keys(stats.dailyActivity)).toEqual(['2026-11-08']);
    expect(JSON.stringify(stats)).not.toContain('2026-03-04');
    expect(JSON.stringify(stats)).not.toContain('secret de la fondation');

    // Et `firstMessageAt` est le premier message VISIBLE, jamais le vrai premier.
    expect(stats.participantStats[USER_ID].firstMessageAt)
      .toBe('2026-11-08T09:00:00.000Z');

    // La requête elle-même est bornée — un témoin sur la seule sortie passerait
    // au vert sur un filtre appliqué APRÈS avoir tout lu (§ le `where` dit qui SORT).
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: FLOOR });
  });

  it('sous plancher, l\'agrégat n\'est PAS persisté — la ligne partagée reste complète', async () => {
    // Un `upsert` sous plancher écraserait les compteurs de TOUT LE MONDE avec la
    // vue partielle d'un seul lecteur : la fuite se changerait en corruption.
    const service = new (ConversationMessageStatsService as any)();
    const prisma = makeServicePrisma();

    await service.getStats(prisma, CONV_ID, { historyFloor: FLOOR });

    expect(prisma.conversationMessageStats.upsert).not.toHaveBeenCalled();
  });

  it('sans plancher, le chemin NOMINAL est inchangé : ligne partagée et persistance', async () => {
    const service = new (ConversationMessageStatsService as any)();
    const prisma = makeServicePrisma();

    const stats = await service.getStats(prisma, CONV_ID, { historyFloor: null });

    expect(stats.totalMessages).toBe(2);
    expect(prisma.conversationMessageStats.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
  });

  it('deux lecteurs de MÊME plancher ne relisent pas deux fois ; deux planchers DIFFÉRENTS, si', async () => {
    // Le cache est par (conversation, plancher) : la clé nue servirait à un
    // lecteur borné l'agrégat complet d'un lecteur qui ne l'est pas — la fuite
    // par le cache, qu'aucune garde de route ne verrait.
    const service = new (ConversationMessageStatsService as any)();
    const prisma = makeServicePrisma();

    await service.getStats(prisma, CONV_ID, { historyFloor: FLOOR });
    await service.getStats(prisma, CONV_ID, { historyFloor: new Date(FLOOR) });
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);

    const other = await service.getStats(prisma, CONV_ID, {
      historyFloor: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    expect(other.totalMessages).toBe(2);

    // Et un lecteur SANS plancher ne lit pas dans le seau d'un lecteur borné.
    const full = await service.getStats(prisma, CONV_ID, { historyFloor: null });
    expect(full.totalMessages).toBe(2);
  });

  it('invalider une conversation vide TOUS ses seaux, bornés compris', async () => {
    // Sinon un message neuf rafraîchit le seau nu et laisse les seaux bornés
    // servir un compte périmé pendant cinq minutes.
    const service = new (ConversationMessageStatsService as any)();
    const prisma = makeServicePrisma();

    await service.getStats(prisma, CONV_ID, { historyFloor: FLOOR });
    service.invalidate(CONV_ID);
    await service.getStats(prisma, CONV_ID, { historyFloor: FLOOR });

    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
  });
});
