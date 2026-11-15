/**
 * Le favori de message et le LIEN DE PARTAGE par lequel le lecteur est entré
 * (#7377, règle 1).
 *
 * Le lien répond à DEUX questions sur la même ligne, et le fil
 * (`GET /conversations/:id/messages`) tranche les deux :
 *   - la PORTE : un lien ÉCHU ferme la lecture (403 `SHARE_LINK_EXPIRED`) ;
 *   - le PLANCHER : un lien `allowViewHistory: false` borne la lecture à
 *     l'arrivée du lecteur — sauf pour un ADMIN de plateforme (#3892).
 * Le favori ne doit servir ni poser rien que le fil refuse : une étoile n'est
 * pas une porte dérobée sur une conversation dont le lien est mort.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  DAY_MS,
  HOUR_MS,
  MSG_1,
  MSG_2,
  buildApp,
  conversationRow,
  fromHarnessNow,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  starRow,
  type Store,
} from './starred-messages-harness';

const LINK_ID = '68b0000000000000000000c9';
const JOINED_AT = new Date('2026-09-20T11:00:00.000Z');

/** Le lecteur est entré par un lien ; MSG_1 précède son arrivée, MSG_2 la suit. */
function linkStore(options: { readonly link: Record<string, unknown>; readonly platformRole?: string }): Store {
  return makeStore({
    messages: [
      messageRow({ id: MSG_1, createdAt: new Date('2026-09-20T10:00:00.000Z') }),
      messageRow({ id: MSG_2, createdAt: new Date('2026-09-20T12:00:00.000Z') }),
    ],
    participants: [
      participantRow({ shareLinkId: LINK_ID, joinedAt: JOINED_AT, user: { role: options.platformRole ?? 'USER' } }),
    ],
    conversations: [conversationRow()],
    shareLinks: [{ id: LINK_ID, ...options.link }],
  });
}

const EXPIRED = { allowViewHistory: true, expiresAt: fromHarnessNow(-HOUR_MS) };
const HISTORY_CLOSED = { allowViewHistory: false, expiresAt: null };
const HISTORY_OPEN = { allowViewHistory: true, expiresAt: fromHarnessNow(100 * DAY_MS) };

async function put(store: Store, messageId: string) {
  const app = await buildApp(makePrisma(store));
  try {
    const res = await app.inject({ method: 'PUT', url: `/starred-messages/${messageId}` });
    return { res, body: res.json() };
  } finally {
    await app.close();
  }
}

async function listIds(store: Store): Promise<string[]> {
  const app = await buildApp(makePrisma(store));
  try {
    const res = await app.inject({ method: 'GET', url: '/starred-messages' });
    expect(res.statusCode).toBe(200);
    return res.json().data.map((item: { message: { id: string } }) => item.message.id);
  } finally {
    await app.close();
  }
}

function withStars(store: Store): Store {
  return {
    ...store,
    stars: [
      starRow({ id: '68c000000000000000000001', messageId: MSG_1, createdAt: new Date('2026-09-21T09:00:00.000Z') }),
      starRow({ id: '68c000000000000000000002', messageId: MSG_2, createdAt: new Date('2026-09-21T10:00:00.000Z') }),
    ],
  };
}

describe('lien ÉCHU — la porte du fil est fermée, celle du favori aussi', () => {
  it("refuse de poser une étoile (404 indistinct), sans rien écrire", async () => {
    const store = linkStore({ link: EXPIRED });
    const { res, body } = await put(store, MSG_2);

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe('MESSAGE_NOT_FOUND');
    expect(store.stars).toHaveLength(0);
  });

  it("ne sert plus aucune étoile de la conversation, sans les effacer", async () => {
    const store = withStars(linkStore({ link: EXPIRED }));

    expect(await listIds(store)).toEqual([]);
    expect(store.stars).toHaveLength(2);
  });

  it('un lien encore valide laisse passer', async () => {
    const store = withStars(linkStore({ link: HISTORY_OPEN }));

    expect(await listIds(store)).toEqual([MSG_2, MSG_1]);
  });
});

describe('lien sans historique — le plancher est l’arrivée du lecteur', () => {
  it("refuse une étoile sur un message d'avant l'arrivée, l'accepte après", async () => {
    const before = await put(linkStore({ link: HISTORY_CLOSED }), MSG_1);
    const after = await put(linkStore({ link: HISTORY_CLOSED }), MSG_2);

    expect(before.res.statusCode).toBe(404);
    expect(after.res.statusCode).toBe(200);
  });

  it("ne sert que les messages postérieurs à l'arrivée", async () => {
    expect(await listIds(withStars(linkStore({ link: HISTORY_CLOSED })))).toEqual([MSG_2]);
  });

  it('un ADMIN de plateforme lit tout l’historique (#3892) : ni refus, ni ligne retirée', async () => {
    const put1 = await put(linkStore({ link: HISTORY_CLOSED, platformRole: 'ADMIN' }), MSG_1);

    expect(put1.res.statusCode).toBe(200);
    expect(await listIds(withStars(linkStore({ link: HISTORY_CLOSED, platformRole: 'ADMIN' })))).toEqual([MSG_2, MSG_1]);
  });
});
