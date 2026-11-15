/**
 * #16578 — `GET /conversations/:id/pinned-messages` sert un éphémère ÉCHU pour
 * son lecteur, et le décompte de personne.
 *
 * Suite de #16558, dont la leçon est : on ne trouve pas le site fautif par les
 * APPELANTS d'une constante — par construction il ne l'importe pas — mais en
 * énumérant les SERVEURS de la donnée. L'énumération de `prisma.message.*` +
 * `content: true` a rendu treize fichiers hors du bloc de protection ; celui-ci
 * est le seul à servir une bulle COMPLÈTE à un lecteur ordinaire.
 *
 * Il écrivait à la main QUATRE des sept champs du bloc (`isViewOnce`,
 * `isBlurred`, `expiresAt`, `effectFlags`) — ce qui le faisait ressembler à une
 * porte conforme — et il lui manquait les trois autres PLUS les deux coupures
 * de service par lecteur que `keepAliveForReader` porte pour la recherche, le
 * fil et le lien de partage. Le doc-comment de cette fonction ÉNUMÈRE ces trois
 * portes ; l'épingle est la quatrième, et elle n'y figurait pas (leçon 261 :
 * une énumération de sites affirme AUSSI « ce sont les sites où la règle
 * s'applique », et cette seconde moitié n'est presque jamais vérifiée).
 *
 * ─── CE QUE CHAQUE TÉMOIN GARDE ────────────────────────────────────────────
 *
 *  1. un éphémère ÉCHU pour CE lecteur ne figure plus dans la page ;
 *  2. un éphémère VIVANT y figure avec l'échéance DU LECTEUR — pas la colonne
 *     interne de destruction, qui vaut le plafond de rétention de sept jours ;
 *  3. sa DURÉE est servie : c'est d'elle, et non de l'échéance, que les trois
 *     clients dérivent leur décompte local (#7451) ;
 *  4. les compteurs de vue unique sont servis, comme sur `GET …/messages` ;
 *  5. le jeu de clés de protection servi est lu DEPUIS
 *     `MESSAGE_PROTECTION_SELECT` : une cinquième famille ajoutée demain fait
 *     tomber ce témoin au lieu de passer en silence.
 *
 * Le témoin 2 est un témoin de RANG écrit sur un rang AUTRE que le premier : si
 * l'échéance du lecteur valait la colonne brute, la règle juste et le bug
 * rendraient le même verdict, et le témoin ne pourrait pas tomber.
 *
 * `@meeshy/shared/types/api-schemas` n'est PAS mocké — c'est
 * `fast-json-stringify` qu'on traverse, donc la couche où `ephemeralDuration`
 * et les deux compteurs sont DÉCLARÉS par `messageSchema` sans qu'aucun
 * gestionnaire les PRODUISE (forme 2 du § « Un schéma de réponse sans
 * `properties` », lue à l'envers).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';
import { MESSAGE_PROTECTION_SELECT } from '../../../routes/conversations/messageProtectionProjection';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439201';
const USER_ID = '507f1f77bcf86cd799439202';
const READER_PART_ID = '507f1f77bcf86cd799439203';
const SENDER_PART_ID = '507f1f77bcf86cd799439204';

const PLAIN_ID = '507f1f77bcf86cd799439301';
const EXPIRED_ID = '507f1f77bcf86cd799439302';
const LIVE_ID = '507f1f77bcf86cd799439303';
const VIEW_ONCE_ID = '507f1f77bcf86cd799439304';

/**
 * L'horloge RÉELLE, et non des temps simulés : la route construit son propre
 * `new Date()` au fond de `keepAliveForReader`, et `jest.useFakeTimers()`
 * suspend aussi les minuteries internes de Fastify — `app.inject` ne rend
 * jamais. Les échéances de la fixture sont donc posées RELATIVEMENT à
 * maintenant, ce qui est de toute façon la seule façon honnête de décrire
 * « échu pour ce lecteur » et « vivant pour ce lecteur ».
 */
const NOW = new Date();

/** La durée d'un éphémère de la fixture, en secondes. */
const EPHEMERAL_SECONDS = 30;

/**
 * `D(lecteur)` de l'éphémère ÉCHU : au-delà de la grâce d'une heure, donc la
 * passerelle ne doit plus le SERVIR du tout.
 */
const EXPIRED_READER_DEADLINE = new Date(NOW.getTime() - EPHEMERAL_UNAVAILABILITY_GRACE_MS - 60_000);

/** `D(lecteur)` de l'éphémère VIVANT — dix minutes devant lui. */
const LIVE_READER_DEADLINE = new Date(NOW.getTime() + 10 * 60_000);

/**
 * La colonne INTERNE de destruction (#7451) : le plafond de rétention de sept
 * jours. C'est elle que la porte servait, et elle n'est l'échéance de personne.
 */
const RAW_DESTRUCTION = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

const SENDER_ROW = {
  id: SENDER_PART_ID,
  userId: USER_ID,
  displayName: 'Alice',
  avatar: null,
  type: 'member',
  user: {
    id: USER_ID,
    username: 'alice',
    firstName: 'Alice',
    lastName: null,
    displayName: 'Alice',
    avatar: null,
    isOnline: false,
  },
};

type Row = Record<string, unknown>;

/** Une ligne `Message` telle que MongoDB la porte, protections comprises. */
function messageRow(overrides: Row): Row {
  return {
    conversationId: CONV_ID,
    senderId: SENDER_PART_ID,
    originalLanguage: 'fr',
    messageType: 'text',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    pinnedAt: new Date('2026-11-07T11:00:00.000Z'),
    pinnedBy: USER_ID,
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    ephemeralDuration: null,
    translations: null,
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
    updatedAt: new Date('2026-11-07T10:00:00.000Z'),
    metadata: null,
    attachments: [],
    sender: SENDER_ROW,
    _count: { reactions: 0, replies: 0 },
    ...overrides,
  };
}

const ROWS: Row[] = [
  messageRow({ id: PLAIN_ID, content: 'Rappel : réunion déplacée' }),
  messageRow({
    id: EXPIRED_ID,
    content: 'Le code du coffre est 4719',
    ephemeralDuration: EPHEMERAL_SECONDS,
    expiresAt: RAW_DESTRUCTION,
  }),
  messageRow({
    id: LIVE_ID,
    content: 'On se voit dans dix minutes',
    ephemeralDuration: EPHEMERAL_SECONDS,
    expiresAt: RAW_DESTRUCTION,
  }),
  messageRow({
    id: VIEW_ONCE_ID,
    content: 'À usage unique',
    isViewOnce: true,
    maxViewOnceCount: 3,
    viewOnceCount: 1,
  }),
];

/** Les échéances par lecteur, telles que `MessageStatusEntry` les porte. */
const STATUS_ENTRIES = [
  { messageId: EXPIRED_ID, participantId: READER_PART_ID, ephemeralExpiresAt: EXPIRED_READER_DEADLINE },
  { messageId: LIVE_ID, participantId: READER_PART_ID, ephemeralExpiresAt: LIVE_READER_DEADLINE },
];

/**
 * Projection à la manière de Prisma : un `select` ne rend QUE ses clés. Sans ce
 * dépouillement, le double rendrait sa fixture entière et le témoin
 * n'observerait jamais l'effet du correctif — il mesurerait sa propre fixture.
 */
function projectBySelect(row: Row, select: unknown): Row {
  if (select === true || select === undefined) return { ...row };
  const spec = (select as { select?: Record<string, unknown> }).select ?? (select as Record<string, unknown>);
  return Object.keys(spec).reduce<Row>((acc, key) => {
    if (spec[key] === true && key in row) return { ...acc, [key]: row[key] };
    if (typeof spec[key] === 'object' && spec[key] !== null && key in row) return { ...acc, [key]: row[key] };
    return acc;
  }, {});
}

function buildApp(): { app: FastifyInstance; captured: { pageSelect?: any } } {
  const captured: { pageSelect?: any } = {};
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };

  const prisma: any = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: READER_PART_ID,
        userId: USER_ID,
        isActive: true,
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: null,
      }),
    },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    messageStatusEntry: {
      findMany: jest.fn<any>(async ({ where }: { where: any }) => {
        const wanted: string[] = where?.messageId?.in ?? [];
        return STATUS_ENTRIES.filter((entry) => wanted.includes(entry.messageId));
      }),
    },
    message: {
      // Deux lectures passent ici : la PAGE des épingles (`pinnedAt`) et, le
      // cas échéant, l'ascendance des citations (`id: { in: … }`). Un double
      // qui ne les distingue pas rendrait la page à la seconde et le témoin
      // mesurerait un rejeu de lui-même.
      findMany: jest.fn<any>(async ({ where, select }: { where: any; select: Record<string, unknown> }) => {
        if (where?.pinnedAt) {
          captured.pageSelect = select;
          return ROWS.map((row) => projectBySelect(row, { select }));
        }
        const wanted: string[] = where?.id?.in ?? [];
        return ROWS.filter((row) => wanted.includes(row.id as string)).map((row) => projectBySelect(row, { select }));
      }),
      count: jest.fn<any>().mockResolvedValue(ROWS.length),
    },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagePinRoutes(app, prisma, authMiddleware, (app as any).socketIOHandler);
  return { app, captured };
}

async function servedPage(): Promise<{ rows: any[]; body: any; captured: { pageSelect?: any } }> {
  const { app, captured } = buildApp();
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    return { rows: body.data, body, captured };
  } finally {
    await app.close();
  }
}

const byId = (rows: any[], id: string) => rows.find((row) => row.id === id);

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/pinned-messages — la protection servie est celle du LECTEUR (#16578)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("un éphémère ÉCHU pour ce lecteur ne figure plus dans la page — ni son contenu, ni sa ligne", async () => {
    const { rows } = await servedPage();

    expect(byId(rows, EXPIRED_ID)).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain('Le code du coffre');
  });

  it("un éphémère VIVANT porte l'échéance DU LECTEUR, jamais la colonne interne de destruction", async () => {
    const { rows } = await servedPage();
    const live = byId(rows, LIVE_ID);

    expect(live).toBeDefined();
    expect(new Date(live.expiresAt).toISOString()).toBe(LIVE_READER_DEADLINE.toISOString());
    expect(new Date(live.expiresAt).toISOString()).not.toBe(RAW_DESTRUCTION.toISOString());
  });

  it("la DURÉE d'un éphémère est servie — c'est d'elle que les clients dérivent leur décompte (#7451)", async () => {
    const { rows } = await servedPage();

    expect(byId(rows, LIVE_ID).ephemeralDuration).toBe(EPHEMERAL_SECONDS);
    expect(byId(rows, PLAIN_ID).ephemeralDuration).toBeNull();
  });

  it('les compteurs de vue unique sont servis, comme sur `GET …/messages`', async () => {
    const { rows } = await servedPage();
    const once = byId(rows, VIEW_ONCE_ID);

    expect(once).toMatchObject({ isViewOnce: true, maxViewOnceCount: 3, viewOnceCount: 1 });
  });

  it("la page sert TOUTES les clés de `MESSAGE_PROTECTION_SELECT` — une cinquième famille fait tomber ce témoin", async () => {
    const { rows, captured } = await servedPage();
    const protectionKeys = Object.keys(MESSAGE_PROTECTION_SELECT);

    for (const key of protectionKeys) {
      expect(captured.pageSelect).toHaveProperty(key);
      expect(byId(rows, PLAIN_ID)).toHaveProperty(key);
    }
  });

  it("le reste de la page est intact — le message ordinaire, son auteur, sa pagination", async () => {
    const { rows, body } = await servedPage();
    const plain = byId(rows, PLAIN_ID);

    expect(plain.content).toBe('Rappel : réunion déplacée');
    expect(plain.sender).toEqual(expect.objectContaining({ username: 'alice' }));
    expect(body.pagination).toEqual(expect.objectContaining({ offset: 0, limit: 50 }));
  });
});
