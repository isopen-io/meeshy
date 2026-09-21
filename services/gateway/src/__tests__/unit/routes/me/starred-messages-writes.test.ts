/**
 * `PUT` / `DELETE /me/starred-messages/:messageId` — l'écriture du favori de
 * message (#7377). Règles : `services/gateway/decisions.md`, § « Le favori de
 * message ».
 *
 * Chaque témoin assert sur l'EFFET — la ligne `MessageStar` écrite ou non,
 * l'événement émis ou non — jamais sur le seul statut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  ANONYMOUS,
  CONV_A,
  CONV_B,
  MSG_1,
  USER_ID,
  buildApp,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  starRow,
  type Emitted,
  type Store,
} from './starred-messages-harness';

async function put(store: Store, messageId: string, options: { authContext?: Record<string, unknown> } = {}) {
  const emitted: Emitted[] = [];
  const app = await buildApp(makePrisma(store), { emitted, ...options });
  try {
    const res = await app.inject({ method: 'PUT', url: `/starred-messages/${messageId}` });
    return { res, body: res.json(), emitted };
  } finally {
    await app.close();
  }
}

async function remove(store: Store, messageId: string) {
  const emitted: Emitted[] = [];
  const app = await buildApp(makePrisma(store), { emitted });
  try {
    const res = await app.inject({ method: 'DELETE', url: `/starred-messages/${messageId}` });
    return { res, body: res.json(), emitted };
  } finally {
    await app.close();
  }
}

function readableStore(overrides: Partial<Store> = {}): Store {
  return makeStore({
    messages: [messageRow()],
    participants: [participantRow()],
    ...overrides,
  });
}

describe('PUT /starred-messages/:messageId — le participant pose son étoile', () => {
  it("écrit UNE étoile personnelle, avec la conversation du MESSAGE, et le dit à ses autres appareils", async () => {
    const store = readableStore();
    const { res, body, emitted } = await put(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(store.stars).toHaveLength(1);
    expect(store.stars[0]).toMatchObject({ userId: USER_ID, messageId: MSG_1, conversationId: CONV_A });
    const starredAt = (store.stars[0].createdAt as Date).toISOString();
    expect(body.data).toEqual({ messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt });
    expect(emitted).toEqual([
      {
        room: `user:${USER_ID}`,
        event: 'message:starred',
        payload: { messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt },
      },
    ]);
  });

  it('est idempotente : reposer ne crée pas de seconde ligne et ne change pas la date', async () => {
    const existing = starRow({ createdAt: new Date('2026-09-01T08:00:00.000Z') });
    const store = readableStore({ stars: [existing] });
    const { res, body } = await put(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(store.stars).toHaveLength(1);
    expect(body.data.starredAt).toBe('2026-09-01T08:00:00.000Z');
  });
});

describe('PUT — règle 1 : le droit de lire se juge à la participation courante', () => {
  it("refuse un NON-participant par un 404 indistinct, sans rien écrire ni émettre", async () => {
    const store = readableStore({ participants: [participantRow({ conversationId: CONV_B })] });
    const { res, body, emitted } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe('MESSAGE_NOT_FOUND');
    expect(store.stars).toHaveLength(0);
    expect(emitted).toEqual([]);
  });

  it("refuse qui a QUITTÉ la conversation (participation inactive)", async () => {
    const store = readableStore({ participants: [participantRow({ isActive: false })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it("refuse un participant BANNI dont la ligne est restée active", async () => {
    const store = readableStore({ participants: [participantRow({ bannedAt: new Date('2026-09-10T00:00:00.000Z') })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it("refuse un message d'AVANT le plancher d'historique du lecteur", async () => {
    const store = readableStore({
      participants: [participantRow({ historyVisibleFrom: new Date('2026-09-20T11:00:00.000Z') })],
    });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it('refuse un message que le lecteur a retiré de SA vue', async () => {
    const store = readableStore({ deletions: [{ userId: USER_ID, messageId: MSG_1 }] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it("refuse un message d'avant l'effacement d'historique du lecteur", async () => {
    const store = readableStore({
      prefs: [{ userId: USER_ID, conversationId: CONV_A, clearHistoryBefore: new Date('2026-09-20T11:00:00.000Z') }],
    });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it('refuse un contexte SANS compte (invité par lien)', async () => {
    const store = readableStore();
    const { res } = await put(store, MSG_1, { authContext: ANONYMOUS });

    expect(res.statusCode).toBe(403);
    expect(store.stars).toHaveLength(0);
  });
});

describe('PUT — règle 2 : supprimé, expiré, vue unique', () => {
  it('rend 404 sur un message supprimé pour tous', async () => {
    const store = readableStore({ messages: [messageRow({ deletedAt: new Date('2026-09-21T00:00:00.000Z') })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it('rend 404 sur un message éphémère EXPIRÉ', async () => {
    const store = readableStore({ messages: [messageRow({ expiresAt: new Date('2026-09-21T11:00:00.000Z') })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });

  it('rend 409 MESSAGE_NOT_STARRABLE sur un message à vue unique (booléen)', async () => {
    const store = readableStore({ messages: [messageRow({ isViewOnce: true })] });
    const { res, body, emitted } = await put(store, MSG_1);

    expect(res.statusCode).toBe(409);
    expect(body.code).toBe('MESSAGE_NOT_STARRABLE');
    expect(store.stars).toHaveLength(0);
    expect(emitted).toEqual([]);
  });

  it('rend 409 sur un message à vue unique porté par le SEUL bit effectFlags', async () => {
    const store = readableStore({ messages: [messageRow({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(409);
    expect(store.stars).toHaveLength(0);
  });

  it("ne dit PAS la vue unique à un non-participant : 404, jamais 409", async () => {
    const store = readableStore({
      messages: [messageRow({ isViewOnce: true })],
      participants: [participantRow({ conversationId: CONV_B })],
    });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
  });

  it("rend 404 sur un message qui n'existe pas", async () => {
    const store = readableStore({ messages: [] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(404);
    expect(store.stars).toHaveLength(0);
  });
});

describe('PUT — règle 3 : un message protégé reste étoilable', () => {
  it('pose une étoile sur un message flouté (il sera servi en placeholder)', async () => {
    const store = readableStore({ messages: [messageRow({ isBlurred: true })] });
    const { res } = await put(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(store.stars).toHaveLength(1);
  });
});

describe('PUT — frontière', () => {
  it("refuse un identifiant qui n'est pas un ObjectId par un 400, sans lire la base", async () => {
    const store = readableStore();
    const { res } = await put(store, 'not-an-object-id');

    expect(res.statusCode).toBe(400);
    expect(store.stars).toHaveLength(0);
  });
});

describe('DELETE /starred-messages/:messageId — on peut toujours défaire', () => {
  it("retire l'étoile et le dit aux autres appareils", async () => {
    const store = readableStore({ stars: [starRow()] });
    const { res, body, emitted } = await remove(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(body.data).toEqual({ messageId: MSG_1, starred: false });
    expect(store.stars).toHaveLength(0);
    expect(emitted).toEqual([
      {
        room: `user:${USER_ID}`,
        event: 'message:starred',
        payload: { messageId: MSG_1, conversationId: CONV_A, starred: false, starredAt: null },
      },
    ]);
  });

  it("est idempotente : rien à retirer ⇒ 200, et aucun événement", async () => {
    const store = readableStore();
    const { res, body, emitted } = await remove(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(body.data).toEqual({ messageId: MSG_1, starred: false });
    expect(emitted).toEqual([]);
  });

  it("reste possible quand le message est supprimé et que le lecteur a quitté la conversation", async () => {
    const store = makeStore({
      messages: [messageRow({ deletedAt: new Date('2026-09-21T00:00:00.000Z') })],
      participants: [participantRow({ isActive: false })],
      stars: [starRow()],
    });
    const { res } = await remove(store, MSG_1);

    expect(res.statusCode).toBe(200);
    expect(store.stars).toHaveLength(0);
  });

  it("ne retire jamais l'étoile d'un AUTRE lecteur", async () => {
    const store = readableStore({ stars: [starRow({ userId: '68b000000000000000000099' })] });
    const { emitted } = await remove(store, MSG_1);

    expect(store.stars).toHaveLength(1);
    expect(emitted).toEqual([]);
  });
});
