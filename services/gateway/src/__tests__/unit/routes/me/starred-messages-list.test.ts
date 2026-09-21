/**
 * `GET /me/starred-messages` — la liste du favori de message (#7377). Règles :
 * `services/gateway/decisions.md`, § « Le favori de message ».
 *
 * Les témoins lisent ce que la réponse DIT, après le sérialiseur réel
 * (`app.inject`) : une colonne qui ne doit pas partir se cherche dans le corps
 * servi, jamais dans un appel de méthode.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { starredMessageItemSchema } from '@meeshy/shared/types/message-star';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  ANONYMOUS,
  CONV_A,
  CONV_B,
  CONV_DIRECT,
  MSG_1,
  MSG_2,
  MSG_3,
  OTHER_USER_ID,
  USER_ID,
  attachmentRow,
  buildApp,
  conversationRow,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  starRow,
  type Store,
} from './starred-messages-harness';

async function list(store: Store, query = '', options: { authContext?: Record<string, unknown> } = {}) {
  const app = await buildApp(makePrisma(store), options);
  try {
    const res = await app.inject({ method: 'GET', url: `/starred-messages${query}` });
    return { res, body: res.json(), raw: res.payload };
  } finally {
    await app.close();
  }
}

/** Un lecteur participant de CONV_A, une étoile sur MSG_1. */
function oneStarStore(overrides: Partial<Store> = {}): Store {
  return makeStore({
    messages: [messageRow()],
    participants: [participantRow()],
    conversations: [conversationRow()],
    stars: [starRow()],
    ...overrides,
  });
}

const MESSAGE_KEYS = [
  'attachments',
  'content',
  'conversationId',
  'createdAt',
  'editedAt',
  'id',
  'isProtected',
  'messageType',
  'originalLanguage',
  'translations',
];

describe('GET /starred-messages — la ligne sert le message VIVANT', () => {
  it('sert le texte original, ses traductions, son auteur et sa conversation', async () => {
    const { res, body } = await list(oneStarStore());

    expect(res.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    const [item] = body.data;
    expect(item).toEqual({
      id: '68c000000000000000000001',
      starredAt: '2026-09-21T09:00:00.000Z',
      message: {
        id: MSG_1,
        conversationId: CONV_A,
        messageType: 'text',
        createdAt: '2026-09-20T10:00:00.000Z',
        editedAt: null,
        isProtected: false,
        content: 'Hello team',
        originalLanguage: 'en',
        translations: [
          { id: `${MSG_1}-fr`, messageId: MSG_1, targetLanguage: 'fr', translatedContent: 'Bonjour l’équipe', translationModel: 'basic' },
        ],
        attachments: [],
      },
      sender: {
        id: '68b0000000000000000000e1',
        userId: OTHER_USER_ID,
        displayName: 'Ada',
        avatar: 'https://cdn.example/ada.png',
        username: 'ada',
      },
      conversation: { id: CONV_A, identifier: 'mshy_equipe', type: 'group', name: 'Équipe', avatar: null },
    });
    expect(starredMessageItemSchema.safeParse(item).success).toBe(true);
    expect(body.pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null, form: 'keyset' });
  });

  it("le Prisme se résout à la LECTURE : une traduction ajoutée après l'étoile est servie", async () => {
    const store = oneStarStore({
      messages: [
        messageRow({
          translations: {
            fr: { text: 'Bonjour', translationModel: 'basic', createdAt: new Date() },
            de: { text: 'Hallo', translationModel: 'basic', createdAt: new Date() },
          },
        }),
      ],
    });
    const { body } = await list(store);

    expect(body.data[0].message.translations.map((t: { targetLanguage: string }) => t.targetLanguage).sort()).toEqual(['de', 'fr']);
  });

  it('pour une conversation DIRECTE, nomme et illustre la conversation par l’autre participant', async () => {
    const store = oneStarStore({
      messages: [messageRow({ conversationId: CONV_DIRECT })],
      participants: [
        participantRow({ conversationId: CONV_DIRECT }),
        participantRow({
          id: '68b000000000000000000012',
          conversationId: CONV_DIRECT,
          userId: OTHER_USER_ID,
          displayName: null,
          avatar: null,
          user: { role: 'USER', username: 'ada', displayName: 'Ada', avatar: 'https://cdn.example/ada.png', isOnline: true },
        }),
      ],
      conversations: [conversationRow({ id: CONV_DIRECT, identifier: 'direct_x', type: 'direct', title: 'Moi et Ada', avatar: null })],
      stars: [starRow({ conversationId: CONV_DIRECT })],
    });
    const { body } = await list(store);

    expect(body.data[0].conversation).toEqual({
      id: CONV_DIRECT,
      identifier: 'direct_x',
      type: 'direct',
      name: 'Ada',
      avatar: 'https://cdn.example/ada.png',
    });
  });
});

describe('GET — règle 4 : rien ne part À CÔTÉ', () => {
  it("ne sert aucune colonne que la projection n'a pas choisie", async () => {
    const store = oneStarStore({
      messages: [messageRow({ attachments: [attachmentRow()] })],
    });
    const { body, raw } = await list(store);

    const [item] = body.data;
    expect(Object.keys(item).sort()).toEqual(['conversation', 'id', 'message', 'sender', 'starredAt']);
    expect(Object.keys(item.message).sort()).toEqual(MESSAGE_KEYS);
    expect(Object.keys(item.sender).sort()).toEqual(['avatar', 'displayName', 'id', 'userId', 'username']);
    expect(Object.keys(item.conversation).sort()).toEqual(['avatar', 'id', 'identifier', 'name', 'type']);
    expect(Object.keys(item.message.attachments[0]).sort()).toEqual(['fileUrl', 'id', 'isMasked', 'mimeType', 'thumbnailUrl']);
    for (const secret of [
      'CIPHERTEXT-MUST-NOT-LEAVE',
      'IV-MUST-NOT-LEAVE',
      'TRANSCRIPT-MUST-NOT-LEAVE',
      'SECRETO',
      'ada@example.com',
      'isOnline',
      'lastActiveAt',
      'reactionSummary',
      'validatedMentions',
      'memberCount',
      'encryptionMode',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe('GET — règle 1 : la participation COURANTE décide, l’étoile reste', () => {
  it("ne sert plus les favoris d'une conversation QUITTÉE, sans effacer l'étoile", async () => {
    const store = oneStarStore({ participants: [participantRow({ isActive: false })] });
    const { body } = await list(store);

    expect(body.data).toEqual([]);
    expect(store.stars).toHaveLength(1);
  });

  it("ne sert pas les favoris d'une conversation dont le lecteur est BANNI", async () => {
    const store = oneStarStore({ participants: [participantRow({ bannedAt: new Date('2026-09-10T00:00:00.000Z') })] });
    const { body } = await list(store);

    expect(body.data).toEqual([]);
  });

  it("ne sert jamais l'étoile d'un AUTRE lecteur", async () => {
    const store = oneStarStore({ stars: [starRow({ userId: OTHER_USER_ID })] });
    const { body } = await list(store);

    expect(body.data).toEqual([]);
  });

  it("ne sert pas un message d'avant le plancher d'historique du lecteur", async () => {
    const store = oneStarStore({
      participants: [participantRow({ historyVisibleFrom: new Date('2026-09-20T11:00:00.000Z') })],
    });
    const { body } = await list(store);

    expect(body.data).toEqual([]);
  });

  it('ne sert pas un message retiré de la vue du lecteur, ni un message effacé de son historique', async () => {
    const hidden = await list(oneStarStore({ deletions: [{ userId: USER_ID, messageId: MSG_1 }] }));
    const cleared = await list(
      oneStarStore({
        prefs: [{ userId: USER_ID, conversationId: CONV_A, clearHistoryBefore: new Date('2026-09-20T11:00:00.000Z') }],
      }),
    );

    expect(hidden.body.data).toEqual([]);
    expect(cleared.body.data).toEqual([]);
  });

  it('refuse un contexte SANS compte', async () => {
    const { res } = await list(oneStarStore(), '', { authContext: ANONYMOUS });

    expect(res.statusCode).toBe(403);
  });
});

describe('GET — règle 2 : supprimé, expiré ou vue unique SORT de la liste', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['supprimé pour tous', { deletedAt: new Date('2026-09-21T00:00:00.000Z') }],
    ['éphémère expiré', { expiresAt: new Date('2026-09-21T11:00:00.000Z') }],
    ['à vue unique (booléen)', { isViewOnce: true }],
    ['à vue unique (bit effectFlags seul)', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
  ];

  it.each(cases)('un message %s ne laisse ni ligne, ni texte, ni traduction', async (_label, overrides) => {
    const { body, raw } = await list(oneStarStore({ messages: [messageRow(overrides)] }));

    expect(body.data).toEqual([]);
    expect(raw).not.toContain('Hello team');
    expect(raw).not.toContain('Bonjour');
  });

  it("une étoile dont le message a disparu de la base ne sert rien", async () => {
    const { body } = await list(oneStarStore({ messages: [] }));

    expect(body.data).toEqual([]);
  });
});

describe('GET — règle 3 : flouté, chiffré ou éphémère vivant = PLACEHOLDER', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['flouté', { isBlurred: true }],
    ['chiffré', { isEncrypted: true }],
    ['éphémère encore vivant', { expiresAt: new Date('2026-09-22T12:00:00.000Z') }],
    ['flouté par le seul bit effectFlags', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
  ];

  it.each(cases)('un message %s garde son identité et perd tout son contenu', async (_label, overrides) => {
    const store = oneStarStore({
      messages: [messageRow({ ...overrides, editedAt: new Date('2026-09-20T10:30:00.000Z'), attachments: [attachmentRow()] })],
    });
    const { body, raw } = await list(store);

    expect(body.data).toHaveLength(1);
    const [item] = body.data;
    expect(item.message).toEqual({
      id: MSG_1,
      conversationId: CONV_A,
      messageType: 'text',
      createdAt: '2026-09-20T10:00:00.000Z',
      editedAt: null,
      isProtected: true,
      content: null,
      originalLanguage: null,
      translations: [],
      attachments: [],
    });
    expect(item.sender.id).toBe('68b0000000000000000000e1');
    expect(item.conversation.id).toBe(CONV_A);
    expect(raw).not.toContain('Hello team');
    expect(raw).not.toContain('Bonjour');
    expect(raw).not.toContain('photo.jpg');
    expect(raw).not.toContain('photo-thumb');
  });

  it("sur un message ordinaire, une pièce masquée à SON niveau part sans URL", async () => {
    const store = oneStarStore({
      messages: [
        messageRow({
          attachments: [
            attachmentRow({ id: '68b0000000000000000000c1', isViewOnce: true }),
            attachmentRow({ id: '68b0000000000000000000c2', effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
            attachmentRow({ id: '68b0000000000000000000c3', fileUrl: 'https://cdn.example/ok.jpg', thumbnailUrl: null }),
          ],
        }),
      ],
    });
    const { body } = await list(store);

    expect(body.data[0].message.attachments).toEqual([
      { id: '68b0000000000000000000c1', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: null, isMasked: true },
      { id: '68b0000000000000000000c2', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: null, isMasked: true },
      { id: '68b0000000000000000000c3', mimeType: 'image/jpeg', fileUrl: 'https://cdn.example/ok.jpg', thumbnailUrl: null, isMasked: false },
    ]);
  });
});

describe('GET — pagination keyset sur l’ÉTOILE', () => {
  function threeStarsStore(overrides: Partial<Store> = {}): Store {
    return makeStore({
      messages: [messageRow({ id: MSG_1 }), messageRow({ id: MSG_2 }), messageRow({ id: MSG_3, conversationId: CONV_B })],
      participants: [participantRow(), participantRow({ id: '68b000000000000000000013', conversationId: CONV_B })],
      conversations: [conversationRow(), conversationRow({ id: CONV_B, identifier: 'mshy_b', title: 'B' })],
      stars: [
        starRow({ id: '68c000000000000000000001', messageId: MSG_1, createdAt: new Date('2026-09-21T09:00:00.000Z') }),
        starRow({ id: '68c000000000000000000002', messageId: MSG_2, createdAt: new Date('2026-09-21T10:00:00.000Z') }),
        starRow({ id: '68c000000000000000000003', messageId: MSG_3, conversationId: CONV_B, createdAt: new Date('2026-09-21T11:00:00.000Z') }),
      ],
      ...overrides,
    });
  }

  it('sert la plus récente d’abord, et reprend exactement où la page précédente s’arrête', async () => {
    const store = threeStarsStore();
    const first = await list(store, '?limit=2');

    expect(first.body.data.map((i: { message: { id: string } }) => i.message.id)).toEqual([MSG_3, MSG_2]);
    expect(first.body.pagination).toMatchObject({ limit: 2, hasMore: true, form: 'keyset' });
    const cursor = first.body.pagination.nextCursor as string;
    expect(typeof cursor).toBe('string');

    const second = await list(store, `?limit=2&cursor=${encodeURIComponent(cursor)}`);
    expect(second.body.data.map((i: { message: { id: string } }) => i.message.id)).toEqual([MSG_1]);
    expect(second.body.pagination).toEqual({ limit: 2, hasMore: false, nextCursor: null, form: 'keyset' });
  });

  it('départage deux étoiles de la même milliseconde par leur id, sans en sauter ni en répéter', async () => {
    const same = new Date('2026-09-21T10:00:00.000Z');
    const store = threeStarsStore({
      stars: [
        starRow({ id: '68c000000000000000000001', messageId: MSG_1, createdAt: same }),
        starRow({ id: '68c000000000000000000002', messageId: MSG_2, createdAt: same }),
      ],
    });
    const first = await list(store, '?limit=1');
    const second = await list(store, `?limit=1&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`);

    expect(first.body.data[0].message.id).toBe(MSG_2);
    expect(second.body.data[0].message.id).toBe(MSG_1);
    expect(second.body.pagination.hasMore).toBe(false);
  });

  it("une page COURTE (étoile retirée par les règles) avance sur la dernière étoile LUE", async () => {
    const store = threeStarsStore({
      messages: [
        messageRow({ id: MSG_1 }),
        messageRow({ id: MSG_2, deletedAt: new Date('2026-09-21T00:00:00.000Z') }),
        messageRow({ id: MSG_3, conversationId: CONV_B }),
      ],
    });
    const first = await list(store, '?limit=2');
    const second = await list(store, `?limit=2&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`);

    expect(first.body.data.map((i: { message: { id: string } }) => i.message.id)).toEqual([MSG_3]);
    expect(first.body.pagination.hasMore).toBe(true);
    expect(second.body.data.map((i: { message: { id: string } }) => i.message.id)).toEqual([MSG_1]);
  });

  it('les étoiles d’une conversation quittée ne raccourcissent pas la page : elles sont filtrées dans la requête', async () => {
    const store = threeStarsStore({ participants: [participantRow()] });
    const { body } = await list(store, '?limit=2');

    expect(body.data.map((i: { message: { id: string } }) => i.message.id)).toEqual([MSG_2, MSG_1]);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('refuse un curseur illisible par un 400, jamais la première page en silence', async () => {
    const { res, body } = await list(threeStarsStore(), '?cursor=not-a-cursor');

    expect(res.statusCode).toBe(400);
    expect(body.code).toBe('INVALID_CURSOR');
  });

  it.each(['0', '51', 'abc'])('refuse la limite %s', async (limit) => {
    const { res } = await list(threeStarsStore(), `?limit=${limit}`);

    expect(res.statusCode).toBe(400);
  });
});
