/**
 * La cascade « lu ⇒ remis » se borne à la frontière de la LECTURE qu'elle suit
 * (#20105).
 *
 * ─── Le défaut ───────────────────────────────────────────────────────────────
 *
 * Dans `markMessagesAsRead`, deux écritures voisines de dix lignes traitaient la
 * même frontière de façon OPPOSÉE. La lecture se bornait, et disait pourquoi
 * (« sans élargir d'un seul message l'ensemble déclaré LU » — le gel est
 * write-once, un message gravé lu à tort l'est pour toujours). Sa cascade de
 * livraison ne se bornait pas :
 *
 *     const deliveredAdvanced = await this._advanceCursor({
 *       messageId,                                 // ← le DERNIER message du fil
 *       idField: 'lastDeliveredMessageId', … });
 *     if (deliveredAdvanced)
 *       await this.freezeMessageStatus({ since: prevDeliveredPosition, at: now,
 *         field: 'deliveredAt' });                 // ← ni `until`, ni `messageIds`
 *
 * `messageId` vaut `latestMessageId ?? le dernier message non supprimé de la
 * conversation`, et la porte REST passe `undefined` (`receipts.ts`, `markFor`).
 * Sur `{ type: 'read', messageIds: [M1, M2, M3] }` d'une conversation de cinq,
 * `deliveredAt` était donc gravé sur M1…M5 — et le curseur posé sur M5.
 *
 * ─── Ce que ça coûte, et le troisième effet n'était dans aucun constat ───────
 *
 * 1. chez l'auteur, chaque bulle du fil passe ✓✓ quand le lecteur a prouvé n'en
 *    avoir affiché que trois. Irréversible : le gel est write-once,
 *    `_advanceCursor` est monotone, et sous `EXACT_READ_TRACKING_SINCE` (armée
 *    en staging ET en production) `MessageStatusEntry.deliveredAt` est la SEULE
 *    autorité ;
 * 2. les trois clients rendent le palier « remis » depuis ces compteurs
 *    (`apps/web/src/lib/view/message.ts`, `MessagePersistenceActor+ReadStatusReceipt.swift`,
 *    `MessageStateMachine.kt`) ;
 * 3. `freezeMessageStatus({ field: 'deliveredAt' })` DÉMARRE les décomptes
 *    éphémères de tout ce qu'il grave (#7451) et les ANNONCE aux deux rooms :
 *    afficher les trois premiers messages d'un fil mettait à brûler un éphémère
 *    resté plus bas, que personne n'avait reçu. C'est le seul des trois effets
 *    qui DÉTRUISE du contenu.
 *
 * ─── Ce que ce témoin mesure, et pourquoi ainsi ──────────────────────────────
 *
 * Il assert sur l'EFFET — quels messages reçoivent un `deliveredAt`, et où le
 * curseur de livraison se pose — jamais sur la forme de l'appel. Un témoin qui
 * vérifierait « la cascade passe-t-elle `messageIds` ? » attesterait le
 * correctif au lieu du comportement.
 *
 * Son double est STATEFUL, et il le faut : un accusé de lecture exact écrit
 * DEUX fois sur la même ligne dans le même appel — le gel de lecture la crée
 * (`readAt` posé, `deliveredAt: null`), celui de livraison la complète par
 * `updateMany`. Un double qui répondrait `[]` à `findMany` ferait passer la
 * seconde écriture par le chemin `createMany`, c'est-à-dire par un chemin que la
 * production ne prend pas ici, et le préfixe contigu prouvé n'aurait aucune
 * entrée à lire.
 *
 * Il honore les DEUX formes de `where` que `freezeMessageStatus` produit —
 * `id: { in: [...] }` (exact) et `createdAt: { gt, lte }` (fenêtre) — parce que
 * c'est exactement ce qui est en jeu : un double qui n'en résoudrait qu'une ne
 * pourrait pas voir la différence entre les deux modes. Toute autre clé LÈVE :
 * un double qui accepte ce que la production ne produit pas mentirait par ce
 * qu'il ACCEPTE, et le témoin qu'il sert passerait.
 *
 * ─── La mesure INVERSE compte autant ─────────────────────────────────────────
 *
 * « Marquer toute la conversation lue » SANS rien rapporter garde sa fenêtre
 * jusqu'à `now` : c'est la forme héritée, le gel de lecture la préserve
 * explicitement (`until: null`), et la lecture déclarant déjà LU toute cette
 * fenêtre, en déclarer la livraison n'ajoute aucune affirmation. Le dernier
 * témoin de ce fichier la garde.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * UNE conversation par témoin. `MessageReadStatusService.recentActionCache` est
 * STATIQUE : deux témoins du même fichier qui acquittent dans la même
 * conversation partagent la clé de déduplication, et le second mesurerait
 * « rien n'a été gravé » sans que la production y soit pour quoi que ce soit.
 */
const CONVERSATIONS = [
  '607f1f77bcf86cd799439011',
  '607f1f77bcf86cd799439021',
  '607f1f77bcf86cd799439031',
  '607f1f77bcf86cd799439041',
  '607f1f77bcf86cd799439051',
  '607f1f77bcf86cd799439061',
];
let conversationCursor = 0;
let CONVERSATION_ID = CONVERSATIONS[0];
const READER_PARTICIPANT = '607f1f77bcf86cd7994390aa';
const PEER_PARTICIPANT = '607f1f77bcf86cd799439099';
const USER_ID = 'user-read-cascade-1';

const M1 = '607f1f77bcf86cd799439101';
const M2 = '607f1f77bcf86cd799439102';
const M3 = '607f1f77bcf86cd799439103';
const M4 = '607f1f77bcf86cd799439104';
const M5 = '607f1f77bcf86cd799439105';

/** Le curseur d'avant l'accusé : R n'avait ni lu ni reçu ce lot. */
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
jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';

type Entry = {
  messageId: string;
  participantId: string;
  conversationId: string;
  deliveredAt: Date | null;
  receivedAt: Date | null;
  readAt: Date | null;
  exactReadAt?: Date | null;
  viewedLanguages: string[];
};

/** L'état que le double tient : les lignes `MessageStatusEntry`. */
let entries: Entry[] = [];
/** Les positions successives du curseur de LIVRAISON, dans l'ordre. */
let deliveryCursorWrites: string[] = [];

const deliveredIds = () => entries.filter((e) => e.deliveredAt !== null).map((e) => e.messageId).sort();
const readIds = () => entries.filter((e) => e.readAt !== null).map((e) => e.messageId).sort();

/**
 * Résout un `where` de `message.findMany` comme le vrai connecteur le ferait,
 * sur les DEUX formes que la production produit. Toute clé inconnue LÈVE.
 */
function resolveMessageWhere(where: any): ReturnType<typeof messagesFor> {
  let rows = messagesFor(CONVERSATION_ID).filter(
    (m) => m.conversationId === (where?.conversationId ?? m.conversationId)
  );
  if (where?.deletedAt === null) rows = rows.filter((m) => m.deletedAt === null);
  if (where?.senderId?.not) rows = rows.filter((m) => m.senderId !== where.senderId.not);

  const byId = where?.id?.in as string[] | undefined;
  const byWindow = where?.createdAt as { gt?: Date; lte?: Date } | undefined;

  if (byId) rows = rows.filter((m) => byId.includes(m.id));
  else if (byWindow) {
    rows = rows.filter(
      (m) =>
        (byWindow.gt === undefined || m.createdAt > byWindow.gt) &&
        (byWindow.lte === undefined || m.createdAt <= byWindow.lte)
    );
  }

  const known = new Set(['conversationId', 'deletedAt', 'senderId', 'id', 'createdAt']);
  const unknown = Object.keys(where ?? {}).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    // La SONDE D'AVIS DE CAPTURE (`uncountedCaptureNoticesIn`, #9630), que le
    // compte de non-lus pose sur la même fenêtre : elle se reconnaît à
    // `messageSource`/`messageType` et compose ses clauses par `AND`. La fixture
    // n'en porte aucun, donc `[]` est la réponse FIDÈLE — pas un relâchement.
    const probeKeys = new Set(['messageSource', 'messageType', 'AND', 'expiresAt']);
    if (unknown.every((k) => probeKeys.has(k))) return [];
    throw new Error(`where de message non résoluble — clés inconnues : ${unknown.join(', ')}`);
  }
  return rows;
}

/**
 * Résout un `where` de `messageStatusEntry`. Il honore `deliveredAt: { not: null }`
 * (le balayage de contiguïté) et la forme `unsetOrNull` (`OR` de deux branches),
 * que le gel write-once emploie — sans elles, le double rendrait des lignes que
 * la production n'apparie pas, et l'inverse.
 */
function resolveEntryWhere(where: any): Entry[] {
  const ids = where?.messageId?.in as string[] | undefined;
  return entries.filter((e) => {
    if (ids && !ids.includes(e.messageId)) return false;
    if (where?.participantId && e.participantId !== where.participantId) return false;
    for (const field of ['deliveredAt', 'readAt'] as const) {
      const clause = where?.[field];
      if (clause === undefined) continue;
      if (clause === null && e[field] !== null) return false;
      if (clause?.not === null && e[field] === null) return false;
    }
    const or = where?.OR as any[] | undefined;
    if (or) {
      // `unsetOrNull(champ)` : `[{ champ: null }, { champ: { isSet: false } }]`.
      const field = Object.keys(or[0] ?? {})[0] as keyof Entry | undefined;
      if (field && (e as any)[field] != null) return false;
    }
    return true;
  });
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
      findMany: jest.fn(async (args: any) => {
        const rows = [...resolveMessageWhere(args?.where)];
        if (args?.orderBy?.createdAt === 'asc') rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (args?.orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const taken = args?.take ? rows.slice(0, args.take) : rows;
        return taken.map((m) => ({ id: m.id, senderId: m.senderId, createdAt: m.createdAt }));
      }),
      findFirst: jest.fn(async (args: any) => {
        const rows = [...resolveMessageWhere(args?.where)];
        if (args?.orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      }),
      findUnique: jest.fn(async (args: any) => {
        const row = messagesFor(CONVERSATION_ID).find((m) => m.id === args?.where?.id);
        return row ? { id: row.id, conversationId: row.conversationId, createdAt: row.createdAt } : null;
      }),
      count: jest.fn(async (args: any) => resolveMessageWhere(args?.where).length),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    messageStatusEntry: {
      findMany: jest.fn(async (args: any) => resolveEntryWhere(args?.where)),
      createMany: jest.fn(async (args: any) => {
        for (const row of args?.data ?? []) {
          entries.push({
            messageId: row.messageId,
            participantId: row.participantId ?? READER_PARTICIPANT,
            conversationId: row.conversationId ?? CONVERSATION_ID,
            deliveredAt: row.deliveredAt ?? null,
            receivedAt: row.receivedAt ?? null,
            readAt: row.readAt ?? null,
            viewedLanguages: row.viewedLanguages ?? [],
          });
        }
        return { count: (args?.data ?? []).length };
      }),
      updateMany: jest.fn(async (args: any) => {
        const matched = resolveEntryWhere(args?.where);
        for (const e of matched) Object.assign(e, args?.data ?? {});
        return { count: matched.length };
      }),
      aggregate: jest.fn(async () => ({ _count: 0 })),
    },
    conversationReadCursor: {
      findUnique: jest.fn(async () => ({
        lastDeliveredAt: CURSOR_BEFORE,
        lastDeliveredMessageId: null,
        lastDeliveredMessageCreatedAt: CURSOR_BEFORE,
        lastReadAt: CURSOR_BEFORE,
        lastReadMessageId: null,
        lastReadMessageCreatedAt: CURSOR_BEFORE,
      })),
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async (args: any) => {
        const written = args?.data?.lastDeliveredMessageId;
        if (typeof written === 'string') deliveryCursorWrites.push(written);
        return { count: 1 };
      }),
      create: jest.fn(async (args: any) => {
        const written = args?.data?.lastDeliveredMessageId;
        if (typeof written === 'string') deliveryCursorWrites.push(written);
        return {};
      }),
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

describe('la cascade « lu ⇒ remis » ne grave que ce que la lecture acquitte (#20105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    entries = [];
    deliveryCursorWrites = [];
    CONVERSATION_ID = CONVERSATIONS[conversationCursor++ % CONVERSATIONS.length];
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
  });

  it("lire M1…M3 d'un fil de cinq ne grave `deliveredAt` ni sur M4 ni sur M5", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'read', messageIds: [M1, M2, M3] });
    await app.close();

    expect(res.statusCode).toBe(200);
    // Le cœur du défaut. M4 et M5 n'ont pas été affichés, et rien ne prouve
    // qu'ils ont atteint l'appareil : les graver remis est irréversible.
    expect(deliveredIds()).toEqual([M1, M2, M3]);
    expect(readIds()).toEqual([M1, M2, M3]);
  });

  it("lire un lot du MILIEU ne grave rien au-delà — et le témoin ne pourrait pas tomber au dernier rang", async () => {
    const app = await buildApp(makePrisma());
    // M1…M2 délibérément, pas M4…M5 : au dernier rang, la fenêtre et la forme
    // bornée rendraient le même verdict (leçon 261).
    const res = await postReceipts(app, { type: 'read', messageIds: [M1, M2] });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(deliveredIds()).toEqual([M1, M2]);
    expect(deliveredIds()).not.toContain(M3);
  });

  it("le curseur de livraison ne saute pas au bas du fil — il s'arrête au préfixe PROUVÉ", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'read', messageIds: [M1, M2, M3] });
    await app.close();

    expect(res.statusCode).toBe(200);
    // Avant #20105 il était posé sur M5, le dernier message de la conversation,
    // ce qui faisait répondre « remis » au repli curseur pour M4 et M5 sur tout
    // message antérieur à la bascule.
    expect(deliveryCursorWrites).not.toContain(M5);
    expect(deliveryCursorWrites).not.toContain(M4);
    expect(deliveryCursorWrites).toEqual([M3]);
  });

  it("un trou ANTÉRIEUR au lot lu retient le curseur sans rien retirer aux entrées figées", async () => {
    const app = await buildApp(makePrisma());
    // M2 et M3 sont affichés, M1 ne l'est pas : le préfixe contigu prouvé est
    // vide, donc le curseur reste en place — réponse plus PAUVRE, jamais fausse.
    const res = await postReceipts(app, { type: 'read', messageIds: [M2, M3] });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(deliveredIds()).toEqual([M2, M3]);
    expect(deliveryCursorWrites).toEqual([]);
  });

  it("`deliveredCount >= readCount` reste vrai sur tout message gravé lu", async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'read', messageIds: [M1, M2, M3] });
    await app.close();

    expect(res.statusCode).toBe(200);
    // L'état impossible que la cascade existe pour empêcher : aucun message ne
    // porte `readAt` sans porter `deliveredAt`.
    const luSansRemis = entries.filter((e) => e.readAt !== null && e.deliveredAt === null);
    expect(luSansRemis.map((e) => e.messageId)).toEqual([]);
  });

  it("en mode FENÊTRE, la cascade s'arrête à la frontière rapportée — pas au bas du fil", async () => {
    const app = await buildApp(makePrisma());
    // `caughtUpToMessageId` SEUL (aucun `messageIds`) : la moitié lecture prend
    // sa branche fenêtre et borne son gel à `until: caughtUpAt`. La cascade doit
    // prendre la MÊME borne haute, et poser son curseur sur la MÊME frontière.
    const res = await postReceipts(app, { type: 'read', caughtUpToMessageId: M3 });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(deliveredIds()).toEqual([M1, M2, M3]);
    expect(deliveryCursorWrites).toEqual([M3]);
  });

  it('la mesure INVERSE — « toute la conversation lue », sans rapport, GARDE sa fenêtre', async () => {
    const app = await buildApp(makePrisma());
    const res = await postReceipts(app, { type: 'read' });
    await app.close();

    expect(res.statusCode).toBe(200);
    // Forme héritée : la lecture déclare LU toute la fenêtre, donc en déclarer
    // la livraison n'ajoute aucune affirmation. Resserrer ici échangerait une
    // réponse fausse contre une autre.
    expect(deliveredIds()).toEqual([M1, M2, M3, M4, M5]);
    expect(readIds()).toEqual([M1, M2, M3, M4, M5]);
  });
});
