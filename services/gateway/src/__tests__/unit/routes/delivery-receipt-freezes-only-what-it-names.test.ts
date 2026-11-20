/**
 * Un accusé de REMISE ne grave `deliveredAt` que sur les messages qu'il NOMME
 * (#20084).
 *
 * ─── Le défaut ───────────────────────────────────────────────────────────────
 *
 * `POST …/messages/:messageId/delivery-receipt` — la porte que la NSE iOS et le
 * service worker web appellent quand un push réveille un destinataire **hors
 * ligne** — gravait `deliveredAt` sur TOUT message depuis le curseur précédent
 * jusqu'à `now`, et pas sur le message rapporté.
 *
 * `markFor` tient la liste exacte (`args.targeted`, le lot vetté) et la passait
 * en TROISIÈME argument positionnel (`latestMessageId`), jamais dans
 * `options.messageIds` :
 *
 *     for (const messageId of args.targeted)
 *       markMessagesAsReceived(participantId, conversationId, messageId);
 *                                                            ↑ aucun `options`
 *
 * `options?.messageIds` étant `undefined`, la branche EXACTE de
 * `markMessagesAsReceived` est sautée et la branche FENÊTRE fige
 * `freezeMessageStatus({ since: prevDeliveredPosition, at: now })` — sans
 * `messageIds` et sans `until`. La clause résolue est alors
 * `createdAt > curseur AND createdAt <= now` : toute la conversation depuis le
 * curseur, **y compris les messages POSTÉRIEURS à celui qu'on acquitte**.
 *
 * La boucle par message n'y change rien, et c'est le point contre-intuitif :
 * **le PREMIER appel fige déjà toute la fenêtre**, les suivants étant des
 * no-ops puisque le gel est write-once. Une écriture « par message » dans sa
 * FORME d'appel est une écriture « par fenêtre » dans son EFFET.
 *
 * ─── Pourquoi c'est irréparable ──────────────────────────────────────────────
 *
 * `EXACT_READ_TRACKING_SINCE` est armée en staging ET en production : pour tout
 * message postérieur, `resolveCursorDeliveredAt` rend `null` et
 * `MessageStatusEntry.deliveredAt` est la SEULE autorité. Le gel est write-once,
 * et `_advanceCursor` est monotone — ni l'un ni l'autre ne se défait. Au drain
 * suivant, `_computeExactDeliveredCursorTarget` part de la position du curseur,
 * donc un trou SOUS elle n'est jamais rejoué.
 *
 * Ce que l'expéditeur voit : R est hors ligne, S envoie M1…M5, APNs ne délivre
 * que le push de M5 — et les CINQ bulles passent ✓✓. M1…M4 n'ont jamais atteint
 * l'appareil, et si elles ont été évincées au plafond de la file de remise,
 * elles ne l'atteindront jamais.
 *
 * ─── Ce que ce témoin mesure, et pourquoi ainsi ──────────────────────────────
 *
 * Il assert sur l'EFFET — quels messages reçoivent une entrée `deliveredAt` —
 * jamais sur la forme de la requête. Un témoin qui vérifierait « `markFor`
 * passe-t-il `options.messageIds` ? » attesterait le correctif au lieu du
 * comportement, et ne dirait rien le jour où la branche exacte changerait de
 * nom.
 *
 * D'où le double : sa table de messages honore les DEUX formes de `where` que
 * `freezeMessageStatus` sait produire — `id: { in: [...] }` (mode exact) et
 * `createdAt: { gt, lte }` (mode fenêtre). C'est l'instrument de mesure : un
 * double qui ne saurait résoudre que l'une des deux ne pourrait pas voir la
 * différence entre les deux modes, c'est-à-dire exactement ce qui est en jeu.
 * Le service réel tourne (il n'est PAS mocké) : c'est `freezeMessageStatus` en
 * personne qui compose le `where`.
 *
 * ─── La mesure INVERSE compte autant ─────────────────────────────────────────
 *
 * `type: 'received'` doit GARDER la fenêtre. C'est sa sémantique juste — un
 * lecteur en ligne, dans le fil, pour qui « tout ce qui précède est arrivé » —
 * et resserrer les deux échangerait une réponse fausse contre une autre. Le
 * dernier témoin de ce fichier la garde.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * UNE conversation par témoin, et c'est nécessaire, pas cosmétique.
 * `MessageReadStatusService.recentActionCache` est STATIQUE et sa clé porte
 * `participant:conversation:received:message:scope` : deux témoins du même
 * fichier qui acquittent le même message dans la même conversation partagent la
 * clé, et le second est avalé par la fenêtre de déduplication (TTL) — il
 * mesurerait alors « rien n'a été gravé » sans que la production y soit pour
 * quoi que ce soit.
 *
 * Ce couplage est d'ailleurs un symptôme du défaut : aujourd'hui `delivered` ne
 * passe aucun périmètre, donc sa clé de scope est celle de la FENÊTRE, la même
 * que `received`. Une fois le périmètre exact passé, les deux ne collisionnent
 * plus — mais un témoin ne doit pas dépendre de cela pour être indépendant.
 */
const CONVERSATIONS = [
  '507f1f77bcf86cd799439011',
  '507f1f77bcf86cd799439021',
  '507f1f77bcf86cd799439031',
  '507f1f77bcf86cd799439041',
  '507f1f77bcf86cd799439051',
];
let conversationCursor = 0;
let CONVERSATION_ID = CONVERSATIONS[0];
const READER_PARTICIPANT = '507f1f77bcf86cd7994390aa';
const PEER_PARTICIPANT = '507f1f77bcf86cd799439099';
const USER_ID = 'user-delivery-freeze-1';

const M1 = '507f1f77bcf86cd799439101';
const M2 = '507f1f77bcf86cd799439102';
const M3 = '507f1f77bcf86cd799439103';
const M4 = '507f1f77bcf86cd799439104';
const M5 = '507f1f77bcf86cd799439105';

/** Le curseur de livraison d'avant l'accusé : R n'avait rien reçu de ce lot. */
const CURSOR_BEFORE = new Date('2026-11-20T09:00:00.000Z');
const at = (iso: string) => new Date(iso);

const messagesFor = (conv: string) => [
  { id: M1, senderId: PEER_PARTICIPANT, conversationId: conv, deletedAt: null, createdAt: at('2026-11-20T10:00:00Z') },
  { id: M2, senderId: PEER_PARTICIPANT, conversationId: conv, deletedAt: null, createdAt: at('2026-11-20T10:01:00Z') },
  { id: M3, senderId: PEER_PARTICIPANT, conversationId: conv, deletedAt: null, createdAt: at('2026-11-20T10:02:00Z') },
  { id: M4, senderId: PEER_PARTICIPANT, conversationId: conv, deletedAt: null, createdAt: at('2026-11-20T10:03:00Z') },
  { id: M5, senderId: PEER_PARTICIPANT, conversationId: conv, deletedAt: null, createdAt: at('2026-11-20T10:04:00Z') },
];

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: unknown[]) => mockResolveConversationId(...a),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: jest.fn(async () => true),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = { userId: USER_ID, type: 'registered', isAnonymous: false, hasFullAccess: true };
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }));

import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';

/** Les ids gravés avec un `deliveredAt`, dans l'ordre où le gel les a écrits. */
let frozen: string[] = [];

/**
 * Résout un `where` de `message.findMany` comme le vrai connecteur le ferait,
 * sur les DEUX formes que `freezeMessageStatus` produit. Toute autre forme
 * LÈVE : un double qui accepte ce que la production ne produit pas ment par ce
 * qu'il ACCEPTE, et le témoin qu'il sert passe.
 */
function resolveMessageWhere(where: any): ReturnType<typeof messagesFor> {
  let rows = messagesFor(CONVERSATION_ID).filter(
    (m) => m.conversationId === (where?.conversationId ?? m.conversationId)
  );
  if (where?.deletedAt === null) rows = rows.filter((m) => m.deletedAt === null);
  if (where?.senderId?.not) rows = rows.filter((m) => m.senderId !== where.senderId.not);

  const byId = where?.id?.in as string[] | undefined;
  const byWindow = where?.createdAt as { gt?: Date; lte?: Date } | undefined;

  if (byId) return rows.filter((m) => byId.includes(m.id));
  if (byWindow) {
    return rows.filter(
      (m) =>
        (byWindow.gt === undefined || m.createdAt > byWindow.gt) &&
        (byWindow.lte === undefined || m.createdAt <= byWindow.lte)
    );
  }

  // Forme NUE — `{ conversationId, deletedAt: null }`, sans borne. C'est bien
  // une forme de production : `markMessagesAsReceived` la pose pour résoudre le
  // message le plus récent quand l'appelant n'en nomme aucun (le chemin de
  // `type: 'received'`). L'accepter n'est donc pas un relâchement du double.
  //
  // Toute clé que ce résolveur ne sait pas interpréter LÈVE en revanche, et
  // c'est délibéré : un double qui accepte ce que la production ne produit pas
  // ment par ce qu'il ACCEPTE, et le témoin qu'il sert passe sans rien prouver.
  const known = new Set(['conversationId', 'deletedAt', 'senderId', 'id', 'createdAt']);
  const unknown = Object.keys(where ?? {}).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`where de message non résoluble — clés inconnues : ${unknown.join(', ')}`);
  }
  return rows;
}

function makePrisma() {
  return {
    participant: {
      findFirst: jest.fn(async () => ({
        id: READER_PARTICIPANT,
        role: 'member',
        joinedAt: at('2020-01-01T00:00:00Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: null,
      })),
      findMany: jest.fn(async () => [
        { id: READER_PARTICIPANT, userId: USER_ID },
        { id: PEER_PARTICIPANT, userId: 'peer-user-1' },
      ]),
    },
    message: {
      findMany: jest.fn(async (args: any) =>
        resolveMessageWhere(args?.where).map((m) => ({ id: m.id, senderId: m.senderId, createdAt: m.createdAt }))
      ),
      findFirst: jest.fn(async (args: any) => {
        const rows = [...resolveMessageWhere(args?.where)];
        if (args?.orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      }),
      count: jest.fn(async (args: any) => resolveMessageWhere(args?.where).length),
    },
    messageStatusEntry: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async (args: any) => {
        for (const row of args?.data ?? []) if (row.deliveredAt) frozen.push(row.messageId);
        return { count: (args?.data ?? []).length };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _count: 0 })),
    },
    conversationReadCursor: {
      findUnique: jest.fn(async () => ({
        lastDeliveredAt: CURSOR_BEFORE,
        lastDeliveredMessageId: null,
        lastDeliveredMessageCreatedAt: CURSOR_BEFORE,
        lastReadAt: null,
        lastReadMessageId: null,
        lastReadMessageCreatedAt: null,
      })),
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    conversation: { findUnique: jest.fn(async () => ({ id: CONVERSATION_ID })) },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => undefined }) } as never);
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return app;
}

const postReceipts = (app: FastifyInstance, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: `/conversations/${CONVERSATION_ID}/receipts`,
    headers: { authorization: 'Bearer test-token' },
    payload: payload as any,
  });

describe("l'accusé de remise ne grave que ce qu'il NOMME (#20084)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    frozen = [];
    CONVERSATION_ID = CONVERSATIONS[conversationCursor++ % CONVERSATIONS.length];
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
  });

  it("un push qui n'a livré que M5 ne grave `deliveredAt` que sur M5", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'delivered', messageIds: [M5] });
    await app.close();

    expect(res.statusCode).toBe(200);
    // Le cœur du défaut : M1…M4 n'ont jamais atteint l'appareil. Les graver
    // « remis » est irréversible (write-once) et ment à l'expéditeur.
    expect([...new Set(frozen)].sort()).toEqual([M5]);
  });

  it("ne grave aucun message POSTÉRIEUR à celui qu'il acquitte", async () => {
    const app = await buildApp(makePrisma());
    // M3 est délibérément au MILIEU : au dernier rang, la fenêtre et la forme
    // exacte rendraient le même verdict et le témoin ne pourrait pas tomber
    // (leçon 261).
    const res = await postReceipts(app, { type: 'delivered', messageIds: [M3] });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(frozen).not.toContain(M4);
    expect(frozen).not.toContain(M5);
    expect([...new Set(frozen)].sort()).toEqual([M3]);
  });

  it("un lot nommant M2 et M4 grave exactement M2 et M4 — ni M1, ni M3, ni M5", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'delivered', messageIds: [M2, M4] });
    await app.close();

    expect(res.statusCode).toBe(200);
    // Le trou (M3) est ENTRE deux messages nommés : c'est la forme que la
    // fenêtre ne peut pas exprimer, quelle que soit sa borne.
    expect([...new Set(frozen)].sort()).toEqual([M2, M4].sort());
  });

  it("`received` GARDE la fenêtre — un lecteur en ligne dit bien « tout ce qui précède est arrivé »", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'received' });
    await app.close();

    expect(res.statusCode).toBe(200);
    // La mesure INVERSE : resserrer celle-ci échangerait une réponse fausse
    // contre une autre. `received` ne rapporte aucun id et avance sur tout le
    // préfixe, par décision (#16961).
    expect([...new Set(frozen)].sort()).toEqual([M1, M2, M3, M4, M5].sort());
  });

  it("un accusé REJOUÉ ne grave rien de plus — le gel est write-once", async () => {
    const prisma = makePrisma();
    prisma.messageStatusEntry.findMany = jest.fn(async () => [
      { messageId: M5, participantId: READER_PARTICIPANT, deliveredAt: at('2026-11-20T10:05:00Z'), readAt: null, viewedLanguages: [] },
    ]);

    const app = await buildApp(prisma);
    const res = await postReceipts(app, { type: 'delivered', messageIds: [M5] });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(frozen).toEqual([]);
  });
});
