/**
 * #14619 — `GET /messages/search` : la recherche de la liste des conversations
 * trouve les MESSAGES, et seulement ceux que le lecteur a le droit de lire.
 *
 * La base est en mémoire et la clause `where` écrite par la production y est
 * ÉVALUÉE (`where-eval.ts`) : un refus vient de la loi, jamais du stub.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockRepair = jest.fn(async (_prisma: unknown, _options: { conversationIds: readonly string[] }) => ({ repaired: 1 }));
jest.mock('../../../services/messaging/repairOrphanedMessageSenders', () => ({
  repairOrphanedMessageSenders: (prisma: unknown, options: { conversationIds: readonly string[] }) => mockRepair(prisma, options),
}));

import { registerGlobalMessageSearchRoute } from '../../../routes/search/global-search';
import { findManyIn, matchesWhere, projected, type Doc } from './where-eval';

const READER = '650000000000000000000001';
const STRANGER = '650000000000000000000002';
const CONV_MINE = '650000000000000000000011';
const CONV_OTHER = '650000000000000000000012';
const CONV_E2EE = '650000000000000000000013';
const CONV_LEFT = '650000000000000000000014';

let clock = 0;
const msgId = () => `660000000000000000${String(++clock).padStart(6, '0')}`;

const sender = { id: 'p-author', userId: STRANGER, displayName: 'Ada', avatar: null, user: { username: 'ada', displayName: 'Ada L.', avatar: null } };

const message = (conversationId: string, content: string, over: Doc = {}): Doc => {
  const id = msgId();
  return {
    id,
    conversationId,
    content,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    translations: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, clock)),
    replyToId: null,
    isEncrypted: false,
    encryptionMode: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    ephemeralDuration: null,
    expiresAt: null,
    deletedAt: null,
    attachments: [],
    sender,
    ...over,
  };
};

const participation = (conversationId: string, over: Doc = {}): Doc => ({
  id: `p-${conversationId}`,
  userId: READER,
  conversationId,
  isActive: true,
  bannedAt: null,
  role: 'member',
  joinedAt: new Date('2026-01-01'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
  ...over,
});

type World = {
  readonly messages: Doc[];
  readonly participants?: Doc[];
  readonly encryption?: Record<string, string | null>;
  readonly clearHistoryBefore?: Record<string, Date>;
  readonly languages?: { systemLanguage: string };
  readonly orphanedSender?: boolean;
};

const ORPHANED_SENDER_ERROR = 'Inconsistent query result: Field sender is required to return data, got `null` instead.';

function prismaFor(world: World) {
  const participants = world.participants ?? [participation(CONV_MINE)];
  const conversationOf = (id: string) => ({ isActive: true, encryptionMode: world.encryption?.[id] ?? null });
  return {
    participant: {
      findMany: async (args: { where: Doc; select?: Record<string, unknown> }) =>
        participants
          .map((p) => ({ ...p, conversation: conversationOf(String(p.conversationId)) }))
          .filter((p) => matchesWhere(p, { ...args.where }))
          .map((p) => projected(p, args.select)),
      findFirst: async () => null,
    },
    conversationShareLink: { findMany: async () => [] },
    userConversationPreferences: {
      findMany: async () => Object.entries(world.clearHistoryBefore ?? {}).map(([conversationId, clearHistoryBefore]) => ({ conversationId, clearHistoryBefore })),
    },
    userMessageDeletion: { findMany: async () => [] },
    messageStatusEntry: { findMany: async () => [] },
    message: {
      findMany: async (args: { where?: Doc; select?: Record<string, unknown>; take?: number }) => {
        if (world.orphanedSender === true && mockRepair.mock.calls.length === 0) throw new Error(ORPHANED_SENDER_ERROR);
        return findManyIn(world.messages, args);
      },
    },
    conversation: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => ({ id, identifier: `conv-${id}`, type: 'group', title: `Groupe ${id.slice(-2)}`, avatar: null, participants: [] })),
    },
    user: { findUnique: async () => world.languages ?? { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null } },
  };
}

async function appFor(world: World, auth: Doc = { registeredUser: { id: READER }, isAnonymous: false, userId: READER, type: 'user' }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (request: { authContext?: unknown }) => {
    request.authContext = auth;
  };
  registerGlobalMessageSearchRoute(app, prismaFor(world) as never, requiredAuth);
  await app.ready();
  return app;
}

const PROTECTION_CAPS = { 'x-search-caps': '1' };

async function search(world: World, query: string, extra = '', headers: Record<string, string> = {}) {
  const app = await appFor(world);
  const response = await app.inject({ method: 'GET', url: `/messages/search?q=${encodeURIComponent(query)}${extra}`, headers });
  await app.close();
  return { status: response.statusCode, body: response.json() as { success: boolean; data: Doc[]; pagination: Doc } };
}

const contents = (data: Doc[]) => data.map((hit) => hit.originalContent);

describe('GET /messages/search — portée du lecteur (#14619)', () => {
  it('trouve un message de ses conversations, avec la carte de la conversation', async () => {
    const { status, body } = await search({ messages: [message(CONV_MINE, 'rendez-vous à la plage')] }, 'PLAGE');
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      conversationId: CONV_MINE,
      content: 'rendez-vous à la plage',
      servedLanguage: null,
      conversation: { id: CONV_MINE, identifier: `conv-${CONV_MINE}`, type: 'group', title: 'Groupe 11' },
      sender: { id: 'p-author', userId: STRANGER, displayName: 'Ada', username: 'ada' },
    });
    expect(body.pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });
  });

  it("ne rend jamais un message d'une conversation dont il n'est pas membre", async () => {
    const { body } = await search({ messages: [message(CONV_OTHER, 'plage secrète'), message(CONV_MINE, 'plage ouverte')] }, 'plage');
    expect(contents(body.data)).toEqual(['plage ouverte']);
  });

  it("ne rend rien d'une conversation quittée ou dont il est banni", async () => {
    const world: World = {
      participants: [participation(CONV_LEFT, { isActive: false }), participation(CONV_OTHER, { bannedAt: new Date('2026-10-01') })],
      messages: [message(CONV_LEFT, 'plage quittée'), message(CONV_OTHER, 'plage bannie')],
    };
    const { body } = await search(world, 'plage');
    expect(body.data).toEqual([]);
  });

  it('ne cherche jamais dans une conversation chiffrée de bout en bout', async () => {
    const world: World = {
      participants: [participation(CONV_MINE), participation(CONV_E2EE)],
      encryption: { [CONV_E2EE]: 'e2ee' },
      messages: [message(CONV_E2EE, 'plage chiffrée'), message(CONV_MINE, 'plage claire')],
    };
    const { body } = await search(world, 'plage');
    expect(contents(body.data)).toEqual(['plage claire']);
  });

  it('ne rend ni un message chiffré, ni une vue unique, ni un éphémère, ni un supprimé', async () => {
    const world: World = {
      messages: [
        message(CONV_MINE, 'plage chiffrée', { isEncrypted: true, encryptionMode: 'e2ee' }),
        message(CONV_MINE, 'plage vue unique', { isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }),
        message(CONV_MINE, 'plage éphémère', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60, expiresAt: new Date(Date.now() + 60_000) }),
        message(CONV_MINE, 'plage supprimée', { deletedAt: new Date('2026-10-02') }),
        message(CONV_MINE, 'plage ordinaire'),
      ],
    };
    const { body } = await search(world, 'plage');
    expect(contents(body.data)).toEqual(['plage ordinaire']);
  });

  it("respecte l'historique effacé du lecteur", async () => {
    const old = message(CONV_MINE, 'plage effacée');
    const recent = message(CONV_MINE, 'plage récente');
    const world: World = { messages: [old, recent], clearHistoryBefore: { [CONV_MINE]: recent.createdAt as Date } };
    const { body } = await search(world, 'plage');
    expect(contents(body.data)).toEqual(['plage récente']);
  });

  it("répare un expéditeur disparu puis rejoue la lecture, au lieu d'un 500", async () => {
    mockRepair.mockClear();
    const world: World = { participants: [participation(CONV_MINE), participation(CONV_OTHER)], messages: [message(CONV_MINE, 'plage réparée')], orphanedSender: true };
    const { status, body } = await search(world, 'plage');
    expect(status).toBe(200);
    expect(contents(body.data)).toEqual(['plage réparée']);
    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect([...mockRepair.mock.calls[0][1].conversationIds].sort()).toEqual([CONV_MINE, CONV_OTHER].sort());
  });

  it('refuse un invité de lien (401) et une requête trop courte (400)', async () => {
    const guest = await appFor({ messages: [] }, { isAnonymous: true, userId: 'p-guest', type: 'anonymous' });
    expect((await guest.inject({ method: 'GET', url: '/messages/search?q=plage' })).statusCode).toBe(401);
    await guest.close();
    expect((await search({ messages: [] }, 'p')).status).toBe(400);
  });
});

describe('GET /messages/search — Prisme du lecteur', () => {
  it('sert la traduction dans sa langue, et trouve le message par cette traduction', async () => {
    const world: World = {
      messages: [message(CONV_MINE, 'see you at the beach', { translations: { fr: { text: 'on se voit à la plage' } } })],
      languages: { systemLanguage: 'fr' },
    };
    const { body } = await search(world, 'plage');
    expect(body.data[0]).toMatchObject({ content: 'on se voit à la plage', servedLanguage: 'fr', originalContent: 'see you at the beach', originalLanguage: 'en' });
  });

  it('ne trouve pas un message par une traduction chiffrée au repos', async () => {
    const world: World = { messages: [message(CONV_MINE, 'xyz', { translations: { fr: { text: 'plage', isEncrypted: true } } })] };
    const { body } = await search(world, 'plage');
    expect(body.data).toEqual([]);
  });
});

describe('GET /messages/search — pagination par curseur', () => {
  it('rend les messages du plus récent au plus ancien, page après page, sans doublon ni trou', async () => {
    const messages = Array.from({ length: 5 }, (_, index) => message(CONV_MINE, `plage ${index}`));
    const first = await search({ messages }, 'plage', '&limit=2');
    expect(contents(first.body.data)).toEqual(['plage 4', 'plage 3']);
    expect(first.body.pagination.hasMore).toBe(true);
    const second = await search({ messages }, 'plage', `&limit=2&cursor=${first.body.pagination.nextCursor}`);
    expect(contents(second.body.data)).toEqual(['plage 2', 'plage 1']);
    const third = await search({ messages }, 'plage', `&limit=2&cursor=${second.body.pagination.nextCursor}`);
    expect(contents(third.body.data)).toEqual(['plage 0']);
    expect(third.body.pagination).toEqual({ limit: 2, hasMore: false, nextCursor: null });
  });

  it("trouve dès la première page un message plus ancien que les deux cents derniers messages traduits", async () => {
    const old = message(CONV_MINE, 'rendez-vous à la plage');
    const recent = Array.from({ length: 450 }, (_, index) => message(CONV_MINE, `bavardage ${index}`, { translations: { fr: { text: `causerie ${index}` } } }));
    const { status, body } = await search({ messages: [old, ...recent] }, 'plage');
    expect(status).toBe(200);
    expect(contents(body.data)).toEqual(['rendez-vous à la plage']);
    expect(body.pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });
  });

  it('poursuit la page suivante sans doublon quand la page se remplit au-delà de la première fenêtre traduite', async () => {
    const olds = Array.from({ length: 3 }, (_, index) => message(CONV_MINE, `plage ancienne ${index}`));
    const recent = Array.from({ length: 250 }, (_, index) => message(CONV_MINE, `bavardage ${index}`, { translations: { fr: { text: `causerie ${index}` } } }));
    const fresh = message(CONV_MINE, 'plage récente');
    const messages = [...olds, ...recent, fresh];
    const first = await search({ messages }, 'plage', '&limit=2');
    expect(contents(first.body.data)).toEqual(['plage récente', 'plage ancienne 2']);
    expect(first.body.pagination.hasMore).toBe(true);
    const second = await search({ messages }, 'plage', `&limit=2&cursor=${first.body.pagination.nextCursor}`);
    expect(contents(second.body.data)).toEqual(['plage ancienne 1', 'plage ancienne 0']);
  });
});

const voiceNote = (over: Doc = {}): Doc => ({
  id: `att-${clock + 1}`,
  mimeType: 'audio/m4a',
  duration: 4200,
  isEncrypted: false,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  transcription: { text: 'on se retrouve à la plage demain', language: 'fr' },
  translations: null,
  ...over,
});

describe('GET /messages/search — le flou voyage avec le résultat (#16957)', () => {
  it("ne sert aucun flouté à un client qui ne déclare pas savoir le voiler", async () => {
    const world: World = {
      messages: [
        message(CONV_MINE, 'plage floutée', { isBlurred: true }),
        message(CONV_MINE, 'plage floutée par bit', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
        message(CONV_MINE, 'plage ouverte'),
      ],
    };
    const { body } = await search(world, 'plage');
    expect(contents(body.data)).toEqual(['plage ouverte']);
    expect(body.data[0]).toMatchObject({ isBlurred: false });
  });

  it('sert le flouté VOILÉ à un client qui le déclare, par drapeau comme par bit', async () => {
    const world: World = {
      messages: [
        message(CONV_MINE, 'plage floutée', { isBlurred: true }),
        message(CONV_MINE, 'plage floutée par bit', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
        message(CONV_MINE, 'plage ouverte'),
      ],
    };
    const { body } = await search(world, 'plage', '', PROTECTION_CAPS);
    expect(body.data.map((hit) => [hit.originalContent, hit.isBlurred])).toEqual([
      ['plage ouverte', false],
      ['plage floutée par bit', true],
      ['plage floutée', true],
    ]);
  });

  it("voile un message dont TOUTES les pièces sont floutées, jamais celui d'une seule parmi d'autres", async () => {
    const world: World = {
      messages: [
        message(CONV_MINE, 'plage en photos floues', { attachments: [voiceNote({ isBlurred: true, transcription: null })] }),
        message(CONV_MINE, 'plage en photos mixtes', { attachments: [voiceNote({ isBlurred: true, transcription: null }), voiceNote({ transcription: null })] }),
      ],
    };
    const { body } = await search(world, 'plage', '', PROTECTION_CAPS);
    expect(body.data.map((hit) => [hit.originalContent, hit.isBlurred])).toEqual([
      ['plage en photos mixtes', false],
      ['plage en photos floues', true],
    ]);
  });
});

describe('GET /messages/search — la transcription répond aussi (#16958)', () => {
  it("trouve un vocal par sa transcription et la sert avec la nature du média", async () => {
    const note = voiceNote();
    const { body } = await search({ messages: [message(CONV_MINE, '', { messageType: 'audio', attachments: [note] })] }, 'PLAGE', '', PROTECTION_CAPS);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      match: 'transcript',
      isBlurred: false,
      transcript: { attachmentId: note.id, mediaKind: 'audio', text: 'on se retrouve à la plage demain', servedLanguage: null, durationMs: 4200 },
    });
  });

  it("dit `content` et ne porte aucune transcription quand c'est le texte qui a répondu", async () => {
    const { body } = await search({ messages: [message(CONV_MINE, 'plage', { attachments: [voiceNote({ transcription: { text: 'rien à voir', language: 'fr' } })] })] }, 'plage', '', PROTECTION_CAPS);
    expect(body.data[0]).toMatchObject({ match: 'content', transcript: null });
  });

  it('sert la transcription dans la langue du lecteur, et la trouve par cette traduction', async () => {
    const note = voiceNote({ transcription: { text: 'see you at the beach', language: 'en' }, translations: { fr: { type: 'audio', transcription: 'on se voit à la plage', createdAt: '2026-11-01' } } });
    const { body } = await search({ messages: [message(CONV_MINE, '', { messageType: 'audio', attachments: [note] })], languages: { systemLanguage: 'fr' } }, 'plage', '', PROTECTION_CAPS);
    expect(body.data[0]).toMatchObject({ match: 'transcript', transcript: { text: 'on se voit à la plage', servedLanguage: 'fr' } });
  });

  it("voile la transcription d'une pièce floutée", async () => {
    const { body } = await search({ messages: [message(CONV_MINE, '', { messageType: 'audio', attachments: [voiceNote({ isBlurred: true })] })] }, 'plage', '', PROTECTION_CAPS);
    expect(body.data[0]).toMatchObject({ match: 'transcript', isBlurred: true });
  });

  it("ne cherche jamais la transcription d'une pièce chiffrée, à vue unique ou éphémère", async () => {
    const world: World = {
      messages: [
        message(CONV_MINE, '', { messageType: 'audio', attachments: [voiceNote({ isEncrypted: true })] }),
        message(CONV_MINE, '', { messageType: 'audio', attachments: [voiceNote({ isViewOnce: true })] }),
        message(CONV_MINE, '', { messageType: 'audio', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60, expiresAt: new Date(Date.now() + 60_000), attachments: [voiceNote()] }),
      ],
    };
    const { body } = await search(world, 'plage', '', PROTECTION_CAPS);
    expect(body.data).toEqual([]);
  });

  it("ne cherche pas les transcriptions pour un client qui ne sait pas les peindre", async () => {
    const { body } = await search({ messages: [message(CONV_MINE, '', { messageType: 'audio', attachments: [voiceNote()] })] }, 'plage');
    expect(body.data).toEqual([]);
  });
});
