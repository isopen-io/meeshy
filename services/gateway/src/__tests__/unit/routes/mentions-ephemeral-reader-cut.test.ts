/**
 * #16583 — `GET /mentions/me` sert le contenu d'un éphémère échu pour son
 * lecteur, et le lui présente comme ORDINAIRE.
 *
 * Troisième et dernière porte de l'énumération ouverte par #16558, après
 * #16578 (épingles) et #16581 (message par identifiant).
 *
 * ─── DEUX QUESTIONS, UNE SEULE AVAIT ÉTÉ INSTRUITE ──────────────────────────
 *
 * #16558 a doté cette porte des drapeaux de protection et a tranché — à raison
 * — de servir `expiresAt: null` plutôt que la colonne interne, faute
 * d'échéances de lecteur résolues : « une porte de service échoue en montrant
 * MOINS ». Ce qu'il n'a pas posé est la COUPURE :
 *
 *   | question                                            | état        |
 *   |-----------------------------------------------------|-------------|
 *   | quelle échéance servir ?                            | #16558      |
 *   | ce message a-t-il le droit d'être servi à ce lecteur ? | jamais posée |
 *
 * ─── ET C'EST LA COMPOSITION DES DEUX QUI AGGRAVE ───────────────────────────
 *
 * `expiresAt: null` + `isViewOnce: false` + `isBlurred: false` ⇒ le client n'a
 * AUCUN drapeau à lire, et rend une bulle ordinaire. Le choix fail-closed sur
 * le décompte est juste pris isolément ; combiné à l'absence de coupure, il
 * retire au client le dernier indice qui lui aurait fait masquer la bulle.
 *
 * > La question à poser à un lot de protection n'est pas seulement « quelle
 * > valeur sert-il ? » mais « ce qu'il décide de TAIRE enlève-t-il à quelqu'un
 * > d'autre le moyen de se protéger ? »
 *
 * ─── LA CLÉ DE LECTEUR EST PAR CONVERSATION ─────────────────────────────────
 *
 * `MessageStatusEntry` est indexé par `Participant.id`, et un `Participant` est
 * scopé par conversation : cette liste TRAVERSE les conversations, donc une
 * seule clé ne peut pas la servir. Un témoin sur DEUX conversations le prouve —
 * sans lui, un code qui résout une clé unique passerait au vert sur une liste
 * mono-conversation et échouerait en production dès la seconde.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439501';
const CONV_A = '507f1f77bcf86cd799439502';
const CONV_B = '507f1f77bcf86cd799439503';
const PART_A = '507f1f77bcf86cd799439504';
const PART_B = '507f1f77bcf86cd799439505';
const SENDER_PART = '507f1f77bcf86cd799439506';

const MSG_PLAIN = '507f1f77bcf86cd799439601';
const MSG_GONE_A = '507f1f77bcf86cd799439602';
const MSG_LIVE_B = '507f1f77bcf86cd799439603';
const MSG_GONE_B = '507f1f77bcf86cd799439604';

/** Horloge réelle : la route construit son propre `new Date()`. */
const NOW = new Date();
const EPHEMERAL_SECONDS = 30;
const GONE = new Date(NOW.getTime() - EPHEMERAL_UNAVAILABILITY_GRACE_MS - 60_000);
const LIVE = new Date(NOW.getTime() + 10 * 60_000);
/** La colonne INTERNE de destruction — le plafond de rétention de sept jours. */
const RAW_DESTRUCTION = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetRecentMentionsForUser = jest.fn<any>();

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    getMentionsForMessage: jest.fn<any>().mockResolvedValue([]),
    getRecentMentionsForUser: mockGetRecentMentionsForUser,
    getUserSuggestionsForConversation: jest.fn<any>().mockResolvedValue([]),
    getUserSuggestionsForPost: jest.fn<any>().mockResolvedValue([]),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () => async (request: any, reply: any): Promise<void> => {
      if (!request.headers['authorization']) {
        await reply.code(401).send({ success: false, error: 'Authentification requise' });
        return;
      }
      request.authContext = { type: 'registered', userId: USER_ID, hasFullAccess: true };
    }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type MentionFixture = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly content: string;
  readonly ephemeralDuration: number | null;
  readonly expiresAt: Date | null;
};

function mentionRow(f: MentionFixture) {
  return {
    id: `mention-${f.messageId}`,
    messageId: f.messageId,
    mentionedAt: new Date(NOW.getTime() - 3600_000),
    message: {
      id: f.messageId,
      content: f.content,
      conversationId: f.conversationId,
      senderId: SENDER_PART,
      createdAt: new Date(NOW.getTime() - 3600_000),
      replyToId: null,
      isViewOnce: false,
      maxViewOnceCount: null,
      viewOnceCount: 0,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: f.expiresAt,
      ephemeralDuration: f.ephemeralDuration,
      sender: { id: SENDER_PART, userId: null, displayName: 'Alice', avatar: null, user: { username: 'alice' } },
      conversation: { id: f.conversationId, title: 'Fil', type: 'group' },
    },
  };
}

const ORDINARY: MentionFixture = {
  messageId: MSG_PLAIN, conversationId: CONV_A,
  content: 'Salut @moi, réunion à 15h', ephemeralDuration: null, expiresAt: null,
};
const GONE_IN_A: MentionFixture = {
  messageId: MSG_GONE_A, conversationId: CONV_A,
  content: 'Le code du coffre est 4719', ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION,
};
const LIVE_IN_B: MentionFixture = {
  messageId: MSG_LIVE_B, conversationId: CONV_B,
  content: 'On se voit dans dix minutes', ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION,
};
const GONE_IN_B: MentionFixture = {
  messageId: MSG_GONE_B, conversationId: CONV_B,
  content: 'Mon adresse est 12 rue des Lilas', ephemeralDuration: EPHEMERAL_SECONDS, expiresAt: RAW_DESTRUCTION,
};

/**
 * Les échéances par (message, participant). La clé de lecteur DIFFÈRE selon la
 * conversation — c'est ce que le témoin à deux conversations exerce.
 */
const STATUS_ENTRIES = [
  { messageId: MSG_GONE_A, participantId: PART_A, ephemeralExpiresAt: GONE },
  { messageId: MSG_LIVE_B, participantId: PART_B, ephemeralExpiresAt: LIVE },
  { messageId: MSG_GONE_B, participantId: PART_B, ephemeralExpiresAt: GONE },
];

type Probe = { participantQueries: any[]; statusEntryQueries: any[] };

async function servedMentions(fixtures: readonly MentionFixture[]): Promise<{
  status: number; rows: any[]; probe: Probe;
}> {
  const probe: Probe = { participantQueries: [], statusEntryQueries: [] };
  mockGetRecentMentionsForUser.mockResolvedValue(fixtures.map(mentionRow));

  const prisma = {
    message: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: {
      // `loadReaderHistoryFloor` passe aussi par là : le double rend la ligne
      // du lecteur DANS la conversation demandée, jamais une ligne unique.
      findFirst: jest.fn<any>(async (args: any) => {
        probe.participantQueries.push(args?.where);
        const convId = args?.where?.conversationId;
        if (convId === CONV_A) return { id: PART_A, userId: USER_ID, isActive: true, historyVisibleFrom: null, shareLinkId: null };
        if (convId === CONV_B) return { id: PART_B, userId: USER_ID, isActive: true, historyVisibleFrom: null, shareLinkId: null };
        return null;
      }),
      findMany: jest.fn<any>(async (args: any) => {
        probe.participantQueries.push(args?.where);
        const wanted: string[] = args?.where?.conversationId?.in ?? [];
        return [
          { id: PART_A, conversationId: CONV_A, userId: USER_ID },
          { id: PART_B, conversationId: CONV_B, userId: USER_ID },
        ].filter((row) => wanted.includes(row.conversationId));
      }),
    },
    messageStatusEntry: {
      findMany: jest.fn<any>(async (args: any) => {
        probe.statusEntryQueries.push(args?.where);
        const wanted: string[] = args?.where?.messageId?.in ?? [];
        return STATUS_ENTRIES.filter((e) => wanted.includes(e.messageId));
      }),
      findFirst: jest.fn<any>(async (args: any) => {
        probe.statusEntryQueries.push(args?.where);
        const { messageId, participantId } = args?.where ?? {};
        return STATUS_ENTRIES.find((e) => e.messageId === messageId && e.participantId === participantId) ?? null;
      }),
    },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as unknown as PrismaClient;

  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  const { default: mentionRoutes } = await import('../../../routes/mentions');
  await app.register(mentionRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: '/mentions/me', headers: { authorization: 'Bearer t' } });
    return { status: res.statusCode, rows: JSON.parse(res.body)?.data ?? [], probe };
  } finally {
    await app.close();
  }
}

const idsOf = (rows: any[]) => rows.map((r) => r.messageId).sort();

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /mentions/me — la coupure de service par lecteur (#16583)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("un éphémère ÉCHU pour ce lecteur ne figure plus dans la liste — ni son contenu", async () => {
    const { status, rows } = await servedMentions([ORDINARY, GONE_IN_A]);

    expect(status).toBe(200);
    expect(idsOf(rows)).toEqual([MSG_PLAIN]);
    expect(JSON.stringify(rows)).not.toContain('Le code du coffre');
  });

  it("la clé de lecteur est résolue PAR CONVERSATION — deux conversations, deux verdicts", async () => {
    const { status, rows } = await servedMentions([ORDINARY, GONE_IN_A, LIVE_IN_B, GONE_IN_B]);

    expect(status).toBe(200);
    // `GONE_IN_A` meurt sous PART_A, `GONE_IN_B` sous PART_B, `LIVE_IN_B` vit.
    // Une clé de lecteur UNIQUE ne pourrait pas rendre ces trois verdicts.
    expect(idsOf(rows)).toEqual([MSG_LIVE_B, MSG_PLAIN].sort());
    expect(JSON.stringify(rows)).not.toContain('rue des Lilas');
  });

  it("un éphémère VIVANT porte l'échéance DU LECTEUR, jamais la colonne interne de destruction", async () => {
    const { rows } = await servedMentions([LIVE_IN_B]);
    const live = rows.find((r) => r.messageId === MSG_LIVE_B);

    expect(live).toBeDefined();
    expect(new Date(live.message.expiresAt).toISOString()).toBe(LIVE.toISOString());
    expect(new Date(live.message.expiresAt).toISOString()).not.toBe(RAW_DESTRUCTION.toISOString());
  });

  it("un message ORDINAIRE est inchangé, et ne coûte aucune lecture d'échéance", async () => {
    const { rows, probe } = await servedMentions([ORDINARY]);
    const plain = rows.find((r) => r.messageId === MSG_PLAIN);

    expect(plain.message.content).toBe('Salut @moi, réunion à 15h');
    expect(plain.message.expiresAt ?? null).toBeNull();
    const deadlineReads = probe.statusEntryQueries.filter((w) => JSON.stringify(w ?? {}).includes('ephemeralExpiresAt'));
    expect(deadlineReads).toEqual([]);
  });

  it('une liste VIDE ne coûte ni participation ni échéance', async () => {
    const { status, rows, probe } = await servedMentions([]);

    expect(status).toBe(200);
    expect(rows).toEqual([]);
    expect(probe.statusEntryQueries).toEqual([]);
    expect(probe.participantQueries).toEqual([]);
  });
});
