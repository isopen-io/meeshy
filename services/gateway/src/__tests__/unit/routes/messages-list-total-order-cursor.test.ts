/**
 * #16684 — **UN MESSAGE QUI PARTAGE SA MILLISECONDE AVEC UNE FRONTIÈRE DE PAGE
 * NE DISPARAÎT PLUS DU FIL.**
 *
 * `GET /conversations/:id/messages` triait `{ createdAt: 'desc' }` — une clé
 * NON unique, à la milliseconde — et bornait sa page suivante par
 * `createdAt < curseur`. Les messages du groupe d'égalité qui n'avaient pas tenu
 * sur la page étaient donc exclus de TOUTES les pages suivantes : perdus, sans
 * erreur et sans trace.
 *
 * Ces témoins PAGINENT POUR DE VRAI : le double Prisma ÉVALUE la clause que la
 * route construit sur un corpus, plutôt que de rendre une page toute faite. Un
 * double qui rend une liste fixe ne peut par construction pas voir une fenêtre
 * fausse — c'est la forme « un double de test ment aussi par ce qu'il ACCEPTE »
 * (cycle 112), appliquée à ce qu'il IGNORE. L'assertion porte donc sur ce que le
 * LECTEUR obtient en suivant `nextCursor`, pas sur la forme d'un `where`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../services/messaging/captureNoticeVisibility', () => ({
  ...(jest.requireActual('../../../services/messaging/captureNoticeVisibility') as object),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({ MessagingService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const SENDER = '507f1f77bcf86cd7994390a1';

type Row = {
  id: string;
  createdAt: Date;
  pinnedAt: Date | null;
  [key: string]: unknown;
};

/** Une ligne de la forme que la route mappe — même squelette que les suites sœurs. */
function row(params: { id: string; at: string; pinnedAt?: string | null; content?: string }): Row {
  return {
    id: params.id,
    conversationId: CONV_ID,
    senderId: SENDER,
    content: params.content ?? params.id,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    metadata: null,
    createdAt: new Date(params.at),
    updatedAt: new Date(params.at),
    pinnedAt: params.pinnedAt === undefined || params.pinnedAt === null ? null : new Date(params.pinnedAt),
    deletedAt: null,
    attachments: [],
    validatedMentions: null,
    _count: { attachments: 0 },
    sender: {
      id: SENDER,
      userId: '507f1f77bcf86cd7994390b1',
      displayName: 'Aïcha',
      avatar: null,
      type: 'user',
      role: 'member',
      language: 'fr',
      user: { id: '507f1f77bcf86cd7994390b1', username: 'aicha', displayName: 'Aïcha' },
    },
  };
}

/* ========================================================================== *
 * L'ÉVALUATEUR DE CLAUSE — il n'implémente que les opérateurs que cette route
 * emploie, et LÈVE sur tout le reste. Se taire sur un opérateur inconnu
 * rendrait ces témoins verts sur une clause qu'ils ne comprennent pas, ce qui
 * est exactement la panne qu'ils sont là pour voir.
 * ========================================================================== */

const compare = (a: unknown, b: unknown): number => {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  throw new Error(`comparaison non supportée: ${String(a)} / ${String(b)}`);
};

function matchesField(value: unknown, filter: unknown): boolean {
  if (filter === null) return value === null || value === undefined;
  if (filter instanceof Date) return value instanceof Date && value.getTime() === filter.getTime();
  if (typeof filter !== 'object') return value === filter;
  return Object.entries(filter as Record<string, unknown>).every(([op, operand]) => {
    switch (op) {
      case 'lt': return value !== null && value !== undefined && compare(value, operand) < 0;
      case 'lte': return value !== null && value !== undefined && compare(value, operand) <= 0;
      case 'gt': return value !== null && value !== undefined && compare(value, operand) > 0;
      case 'gte': return value !== null && value !== undefined && compare(value, operand) >= 0;
      case 'equals': return matchesField(value, operand);
      case 'in': return Array.isArray(operand) && operand.includes(value as never);
      case 'not': return operand === null ? value !== null && value !== undefined : !matchesField(value, operand);
      default: throw new Error(`opérateur de filtre non supporté par le témoin: ${op}`);
    }
  });
}

function matches(candidate: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (key === 'AND') {
      const clauses = Array.isArray(filter) ? filter : [filter];
      return clauses.every((clause) => matches(candidate, clause as Record<string, unknown>));
    }
    if (key === 'OR') return (filter as Record<string, unknown>[]).some((clause) => matches(candidate, clause));
    if (key === 'NOT') return !matches(candidate, filter as Record<string, unknown>);
    return matchesField(candidate[key], filter);
  });
}

type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

function ordered(rows: Row[], orderBy: OrderBy | undefined): Row[] {
  const clauses = (Array.isArray(orderBy) ? orderBy : orderBy === undefined ? [] : [orderBy])
    .flatMap((clause) => Object.entries(clause));
  return [...rows].sort((left, right) => {
    for (const [field, direction] of clauses) {
      const delta = compare(left[field], right[field]);
      if (delta !== 0) return direction === 'desc' ? -delta : delta;
    }
    return 0;
  });
}

function servePage(corpus: Row[], args: any): Row[] {
  const kept = ordered(corpus.filter((candidate) => matches(candidate, args.where ?? {})), args.orderBy);
  const skipped = typeof args.skip === 'number' ? kept.slice(args.skip) : kept;
  return typeof args.take === 'number' ? skipped.slice(0, args.take) : skipped;
}

async function openThread(corpus: Row[]): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      count: jest.fn(async (args: any) => corpus.filter((candidate) => matches(candidate, args?.where ?? {})).length),
      /** Le curseur et la cible d'`around` se résolvent PAR CETTE PORTE — elle doit
       *  rendre la ligne RÉELLE, sinon la fenêtre se construirait sur une date inventée. */
      findFirst: jest.fn(async (args: any) => {
        const found = corpus.find((candidate) => matches(candidate, args?.where ?? {}));
        return found === undefined ? null : found;
      }),
      findMany: jest.fn(async (args: any) => servePage(corpus, args)),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return { app, prisma };
}

/** Les requêtes de PAGE, et elles seules : la route ouvre d'autres
 *  `message.findMany` autour d'une page (citations, lignes d'arrivée), et
 *  `.at(-1)` attrapait l'une d'elles. Le discriminant est le `select` de la
 *  page, seul à demander le contenu. */
const pageQueries = (prisma: any): any[] =>
  prisma.message.findMany.mock.calls
    .map((call: any[]) => call[0])
    .filter((args: any) => args?.select?.content === true);

type Page = { ids: string[]; nextCursor: string | null; hasMore: boolean };

async function readPage(app: FastifyInstance, query: string): Promise<Page> {
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages?${query}` });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  return {
    ids: body.data.map((message: { id: string }) => message.id),
    nextCursor: body.cursorPagination?.nextCursor ?? null,
    hasMore: body.cursorPagination?.hasMore ?? false,
  };
}

/** Suit `nextCursor` jusqu'au bout et rend TOUT ce que le lecteur a vu, dans l'ordre. */
async function readWholeThread(app: FastifyInstance, params: { limit: number; view?: string }): Promise<string[]> {
  const view = params.view === undefined ? '' : `&view=${params.view}`;
  const seen: string[] = [];
  let page = await readPage(app, `limit=${params.limit}${view}`);
  seen.push(...page.ids);
  for (let guard = 0; guard < 10 && page.hasMore && page.nextCursor !== null; guard += 1) {
    page = await readPage(app, `limit=${params.limit}&before=${page.nextCursor}${view}`);
    seen.push(...page.ids);
  }
  return seen;
}

/* QUATRE messages, DEUX dans la même milliseconde, et une page de 2 : la
 * frontière tombe donc **À L'INTÉRIEUR** du groupe d'égalité, un membre restant
 * sur le carreau de la page 1. C'est la seule disposition qui montre la perte —
 * un groupe d'égalité qui tient ENTIER sur une page est servi correctement même
 * par la fenêtre fautive, et un témoin posé là ne peut pas tomber (§ « un témoin
 * de RANG s'écrit sur un rang AUTRE que le premier »).
 *
 * L'ordre DANS l'égalité n'est pas défini côté base ; le double le rend stable
 * sur l'ordre du corpus, ce qui fixe B comme membre servi et C comme membre
 * laissé derrière. Les identifiants sont des ObjectId, dont l'ordre hexadécimal
 * est celui de leur génération. */
const MEME_MS = '2026-11-04T10:00:00.000Z';
const A = '507f1f77bcf86cd799439101'; // le plus ancien
const B = '507f1f77bcf86cd799439102'; // même milliseconde que C
const C = '507f1f77bcf86cd799439103'; // même milliseconde que B
const D = '507f1f77bcf86cd799439104'; // le plus récent, seul dans sa milliseconde

const FRATRIE = [
  row({ id: A, at: '2026-11-04T09:59:59.000Z' }),
  row({ id: B, at: MEME_MS }),
  row({ id: C, at: MEME_MS }),
  row({ id: D, at: '2026-11-04T10:00:01.000Z' }),
];

describe('#16684 · le curseur du fil ordonne TOTALEMENT', () => {
  it('rend les QUATRE messages quand deux partagent la milliseconde de la frontière', async () => {
    const { app } = await openThread(FRATRIE);
    const seen = await readWholeThread(app, { limit: 2 });

    // Sans clé de rupture : page 1 = [D, B], curseur = B, page 2 filtre
    // `createdAt < MEME_MS` — et C, resté sur le carreau, n'est rendu par AUCUNE
    // page. Le lecteur ne voyait que trois messages sur quatre, sans erreur.
    expect([...seen].sort()).toEqual([A, B, C, D].sort());
    await app.close();
  });

  /** La fenêtre ÉLARGIE (`lte`) est le mauvais correctif de ce défaut : elle
   *  échange des pertes contre des DOUBLONS. Ce témoin tombe sous cette
   *  mutation-là, et c'est sa raison d'être. */
  it('ne rend aucun message DEUX fois en suivant le curseur', async () => {
    const { app } = await openThread(FRATRIE);
    const seen = await readWholeThread(app, { limit: 2 });

    expect(new Set(seen).size).toBe(seen.length);
    await app.close();
  });

  it('trie par la clé de la vue PUIS par identifiant — un ordre total, donc stable', async () => {
    const { app, prisma } = await openThread(FRATRIE);
    await readPage(app, 'limit=2');

    expect(pageQueries(prisma)[0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    await app.close();
  });

  it('garde la fratrie de la cible dans la fenêtre `around`', async () => {
    const { app } = await openThread(FRATRIE);
    const page = await readPage(app, `limit=10&around=${B}`);

    // C partage la milliseconde de B : sous `gt: cible.createdAt` il n'était dans
    // aucune des deux moitiés de la fenêtre.
    expect([...page.ids].sort()).toEqual([A, B, C, D].sort());
    await app.close();
  });
});

/* `view=pinned` TRIE par date d'épingle et PAGINAIT par date d'écriture : deux
 * clés différentes, donc des pertes sans qu'aucune égalité de milliseconde soit
 * nécessaire. Épingles POSÉES dans l'ordre inverse de l'écriture. */
const EPINGLES = [
  row({ id: A, at: '2026-11-01T10:00:00.000Z', pinnedAt: '2026-11-03T10:00:00.000Z' }),
  row({ id: B, at: '2026-11-02T10:00:00.000Z', pinnedAt: '2026-11-02T10:00:00.000Z' }),
  row({ id: C, at: '2026-11-03T10:00:00.000Z', pinnedAt: '2026-11-01T10:00:00.000Z' }),
];

describe('#16684 · la clé du curseur SUIT celle de la vue', () => {
  it('rend les trois épinglés quand les épingles contredisent l’ordre d’écriture', async () => {
    const { app } = await openThread(EPINGLES);
    const seen = await readWholeThread(app, { limit: 1, view: 'pinned' });

    expect(seen).toEqual([A, B, C]); // l'ordre des ÉPINGLES, décroissant
    await app.close();
  });

  it('borne la page suivante sur `pinnedAt`, la clé que la vue trie', async () => {
    const { app, prisma } = await openThread(EPINGLES);
    const page = await readPage(app, 'limit=1&view=pinned');
    await readPage(app, `limit=1&view=pinned&before=${page.nextCursor}`);

    const seconde = pageQueries(prisma).at(-1);
    expect(seconde.orderBy).toEqual([{ pinnedAt: 'desc' }, { id: 'desc' }]);
    // La fenêtre borne la clé de la VUE, jamais `createdAt` — c'est la moitié
    // du défaut qui ne demandait aucune égalité de milliseconde pour mordre.
    expect(JSON.stringify(seconde.where)).toContain('pinnedAt');
    await app.close();
  });
});
