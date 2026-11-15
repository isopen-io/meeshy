/**
 * #16581 — `GET /messages/:messageId` ressuscite un éphémère déjà parti de
 * l'écran de son lecteur, et le lui rend étiqueté pour sept jours.
 *
 * Second site de l'énumération de #16578. Les gardes de cette porte —
 * participation active, `deletedAt`, plancher d'historique, avis de capture,
 * vue unique déjà ouverte, présence de l'expéditeur — ne comptaient AUCUNE
 * garde d'éphémère : `grep` sur le corps du gestionnaire ne rendait que les
 * deux lignes du `select`.
 *
 * ─── POURQUOI LES DEUX DÉFAUTS COMPOSENT PIRE QUE LEUR SOMME ────────────────
 *
 * Le seul consommateur MESURÉ de cette route est l'extension de notification
 * iOS (`NSEDataSync.syncMessage`), qui dépose la charge dans l'App Group pour
 * que l'application pré-remplisse la bulle au démarrage à froid. Un éphémère
 * expiré chez ce lecteur était donc réinjecté dans son fil — et il y arrivait
 * daté de sept jours, si bien que le client n'avait aucune raison de le
 * retirer. La résurrection n'était pas transitoire, elle était datée.
 *
 * ─── LA BORNE EST CELLE DU SERVICE, PAS CELLE DE LA SORTIE ──────────────────
 *
 * `isEphemeralServableToReader` (grâce d'une heure) et non
 * `contentStillVisibleToReader` (borne stricte) : cette porte SERT une bulle,
 * elle n'en fait pas sortir le contenu vers un tiers. L'en-tête de
 * `messageReadAccess.ts` tranche la distinction, et la grâce est exactement ce
 * qui permet à un second appareil d'apprendre qu'un message a expiré plutôt que
 * de ne jamais savoir qu'il a existé — c'est-à-dire le travail de la NSE.
 *
 * L'échéance se lit de façon CIBLÉE (`readEphemeralReaderResolution`), jamais
 * par le balayage plafonné d'une page : sur une porte qui DÉCIDE, une ligne
 * absente d'une tranche tronquée se lirait « décompte pas démarré » et
 * ouvrirait la sortie. Le témoin l'exige en assertant sur la REQUÊTE.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'user',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439401';
const READER_USER_ID = '507f1f77bcf86cd799439402';
const READER_PART_ID = '507f1f77bcf86cd799439403';
const SENDER_PART_ID = '507f1f77bcf86cd799439404';
const MESSAGE_ID = '507f1f77bcf86cd799439405';

/**
 * L'horloge RÉELLE : la route construit son propre `new Date()`, et des temps
 * simulés suspendent aussi les minuteries internes de Fastify (`app.inject` ne
 * rend jamais). Les échéances sont donc posées RELATIVEMENT à maintenant — la
 * seule façon honnête de décrire « échu pour ce lecteur ».
 */
const NOW = new Date();
const EPHEMERAL_SECONDS = 30;

/** Au-delà de `D(lecteur) + 1 h` : la passerelle ne doit plus servir du tout. */
const GONE_DEADLINE = new Date(NOW.getTime() - EPHEMERAL_UNAVAILABILITY_GRACE_MS - 60_000);

/** Dans la GRÂCE : la bulle a quitté l'écran, la porte sert encore (#7451). */
const IN_GRACE_DEADLINE = new Date(NOW.getTime() - 60_000);

/** `D(lecteur)` d'un éphémère vivant — dix minutes devant lui. */
const LIVE_DEADLINE = new Date(NOW.getTime() + 10 * 60_000);

/** La colonne INTERNE de destruction : le plafond de rétention de sept jours. */
const RAW_DESTRUCTION = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

type Fixture = {
  readonly ephemeralDuration: number | null;
  readonly expiresAt: Date | null;
  /** `MessageStatusEntry.ephemeralExpiresAt` de CE lecteur, ou `null`. */
  readonly readerDeadline: Date | null;
};

function messageRow(fixture: Fixture) {
  return {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: SENDER_PART_ID,
    content: 'Le code du coffre est 4719',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    updatedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    translations: null,
    metadata: null,
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    viewOnceBurnedAt: null,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: fixture.expiresAt,
    ephemeralDuration: fixture.ephemeralDuration,
    sender: {
      id: SENDER_PART_ID,
      userId: null,
      displayName: 'Invité',
      avatar: null,
      isOnline: false,
      type: 'anonymous',
      user: null,
    },
    // La ligne du LECTEUR, avec son `id` : c'est la clé de ses accusés.
    conversation: { participants: [{ id: READER_PART_ID, userId: READER_USER_ID, role: 'member' }] },
    attachments: [],
  };
}

type Probe = { statusEntryWhere: any[] };

/**
 * Cette route lit DÉJÀ `MessageStatusEntry` pour son résumé d'accusés
 * (`MessageReadStatusService`). Le probe ne retient donc que les lectures
 * d'ÉCHÉANCE — celles qui bornent sur `ephemeralExpiresAt` —, sans quoi un
 * témoin « aucune lecture d'échéance » compterait la lecture des coches et
 * serait faux dès le cas ordinaire.
 */
const deadlineReads = (probe: Probe): any[] =>
  probe.statusEntryWhere.filter((where) => JSON.stringify(where ?? {}).includes('ephemeralExpiresAt'));

async function fetchMessage(fixture: Fixture): Promise<{ status: number; data: any; probe: Probe }> {
  const probe: Probe = { statusEntryWhere: [] };

  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      hasFullAccess: true,
      registeredUser: { id: READER_USER_ID, role: 'USER' },
    };
  });

  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(messageRow(fixture)),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
    messageStatusEntry: {
      // La lecture CIBLÉE : une ligne, par le couple (messageId, participantId).
      findFirst: jest.fn<any>(async (args: any) => {
        probe.statusEntryWhere.push(args?.where);
        return fixture.readerDeadline ? { ephemeralExpiresAt: fixture.readerDeadline } : null;
      }),
      findMany: jest.fn<any>(async (args: any) => {
        probe.statusEntryWhere.push(args?.where);
        return fixture.readerDeadline
          ? [{ messageId: MESSAGE_ID, participantId: READER_PART_ID, ephemeralExpiresAt: fixture.readerDeadline }]
          : [];
      }),
    },
  } as any);

  await app.register(messageRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
    return { status: res.statusCode, data: res.json()?.data, probe };
  } finally {
    await app.close();
  }
}

const ORDINARY: Fixture = { ephemeralDuration: null, expiresAt: null, readerDeadline: null };
const GONE: Fixture = { ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION, readerDeadline: GONE_DEADLINE };
const IN_GRACE: Fixture = { ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION, readerDeadline: IN_GRACE_DEADLINE };
const LIVE: Fixture = { ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION, readerDeadline: LIVE_DEADLINE };
const NOT_STARTED: Fixture = { ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION, readerDeadline: null };

beforeEach(() => {
  mockAuthMiddleware.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /messages/:messageId — la coupure de service par lecteur (#16581)', () => {
  it("un éphémère dont le décompte de ce lecteur est fini (grâce comprise) ne sort plus — ni son contenu", async () => {
    const { status, data } = await fetchMessage(GONE);

    expect(status).toBe(404);
    expect(JSON.stringify(data ?? {})).not.toContain('Le code du coffre');
  });

  it("dans la GRÂCE d'une heure, la porte sert encore — c'est ce qui permet au second appareil d'apprendre l'expiration", async () => {
    const { status, data } = await fetchMessage(IN_GRACE);

    expect(status).toBe(200);
    expect(data.id).toBe(MESSAGE_ID);
    expect(new Date(data.expiresAt).toISOString()).toBe(IN_GRACE_DEADLINE.toISOString());
  });

  it("un éphémère VIVANT porte l'échéance DU LECTEUR, jamais la colonne interne de destruction", async () => {
    const { status, data } = await fetchMessage(LIVE);

    expect(status).toBe(200);
    expect(new Date(data.expiresAt).toISOString()).toBe(LIVE_DEADLINE.toISOString());
    expect(new Date(data.expiresAt).toISOString()).not.toBe(RAW_DESTRUCTION.toISOString());
  });

  it("un décompte NON démarré sert sans échéance — jamais le plafond de rétention", async () => {
    const { status, data } = await fetchMessage(NOT_STARTED);

    expect(status).toBe(200);
    expect(data.expiresAt).toBeNull();
    expect(data.ephemeralDuration).toBe(EPHEMERAL_SECONDS);
  });

  it("l'échéance est lue de façon CIBLÉE — la ligne de CE lecteur, jamais un balayage de page", async () => {
    const { probe } = await fetchMessage(LIVE);

    const reads = deadlineReads(probe);

    expect(reads.length).toBeGreaterThan(0);
    // CIBLÉE : le couple unique, jamais `messageId: { in: [...] }` — la forme
    // du balayage de page, qu'un plafond peut tronquer.
    for (const where of reads) {
      expect(where.messageId).toBe(MESSAGE_ID);
      expect(where.participantId).toBe(READER_PART_ID);
    }
  });

  it("un message ORDINAIRE est inchangé, et ne coûte aucune lecture d'échéance", async () => {
    const { status, data, probe } = await fetchMessage(ORDINARY);

    expect(status).toBe(200);
    expect(data.content).toBe('Le code du coffre est 4719');
    expect(data.expiresAt ?? null).toBeNull();
    expect(deadlineReads(probe)).toEqual([]);
  });
});
