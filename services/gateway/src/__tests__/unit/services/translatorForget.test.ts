/**
 * #13102 — l'oubli au translator : identifiants seuls, durable, rejoué
 * jusqu'à l'acquittement, abandonné après sept jours, jamais bloquant.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import {
  FORGET_GIVE_UP_AFTER_MS,
  FORGET_REPLAY_BATCH,
  FORGET_RESEND_AFTER_MS,
  translatorForget,
  type ForgetQueueStore,
} from '../../../services/translatorForget';
import type { CacheForgetRequest } from '../../../services/zmq-translation/types';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';

function memoryStore(): ForgetQueueStore & { readonly rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    put: async (id, value) => { rows.set(id, value); },
    remove: async (id) => { rows.delete(id); },
    all: async () => Object.fromEntries(rows),
  };
}

function harness(options: { readonly failSend?: boolean } = {}) {
  const store = memoryStore();
  const sent: CacheForgetRequest[] = [];
  const clock = { now: 1_000_000 };
  const forget = translatorForget({
    store,
    now: () => clock.now,
    send: async (request) => {
      if (options.failSend) throw new Error('translator absent');
      sent.push(request);
    },
  });
  return { store, sent, clock, forget };
}

describe('l’oubli au translator', () => {
  it('ne porte que des identifiants valides, et s’inscrit avant de partir', async () => {
    const { forget, sent, store } = harness();
    await forget.forget({ attachmentIds: [PIECE, PIECE, '../x'], messageIds: [MESSAGE, 'Bonjour à tous'] });
    expect(sent).toEqual([{ requestId: expect.any(String), attachmentIds: [PIECE], messageIds: [MESSAGE] }]);
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()].join('')).not.toContain('Bonjour');
  });

  it('rien à oublier, rien n’est envoyé', async () => {
    const { forget, sent, store } = harness();
    await forget.forget({ attachmentIds: [], messageIds: ['pas-un-id'] });
    expect(sent).toEqual([]);
    expect(store.rows.size).toBe(0);
  });

  it('l’acquittement retire la demande ; sans lui, elle est rejouée', async () => {
    const { forget, sent, store, clock } = harness();
    await forget.forget({ attachmentIds: [PIECE] });
    const [first] = sent;
    expect(await forget.replay()).toBe(0);
    clock.now += FORGET_RESEND_AFTER_MS;
    expect(await forget.replay()).toBe(1);
    expect(sent.map((request) => request.requestId)).toEqual([first.requestId, first.requestId]);
    await forget.acknowledge(first.requestId);
    clock.now += FORGET_RESEND_AFTER_MS;
    expect(await forget.replay()).toBe(0);
    expect(store.rows.size).toBe(0);
  });

  it('un translator absent ne fait jamais échouer l’effacement, et la demande attend son retour', async () => {
    const absent = harness({ failSend: true });
    await expect(absent.forget.forget({ messageIds: [MESSAGE] })).resolves.toBeUndefined();
    expect(absent.store.rows.size).toBe(1);
  });

  it('abandonnée après sept jours : le cache du translator a expiré de lui-même', async () => {
    const { forget, store, clock } = harness();
    await forget.forget({ messageIds: [MESSAGE] });
    clock.now += FORGET_GIVE_UP_AFTER_MS + 1;
    expect(await forget.replay()).toBe(0);
    expect(store.rows.size).toBe(0);
  });

  it('ne rend jamais la main en retard : ni un envoi pendu ni une inscription pendue ne la bloquent', async () => {
    const hung = translatorForget({
      store: { put: () => new Promise<void>(() => undefined), remove: async () => undefined, all: async () => ({}) },
      send: () => new Promise<void>(() => undefined),
    });
    const outcome = await Promise.race([
      hung.forget({ attachmentIds: [PIECE] }).then(() => 'returned'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 3_000)),
    ]);
    expect(outcome).toBe('returned');
  });

  it('espace les renvois d’une même demande : 1, puis 2 minutes', async () => {
    const { forget, sent, clock } = harness();
    await forget.forget({ attachmentIds: [PIECE] });
    clock.now += FORGET_RESEND_AFTER_MS;
    expect(await forget.replay()).toBe(1);
    clock.now += FORGET_RESEND_AFTER_MS;
    expect(await forget.replay()).toBe(0);
    clock.now += FORGET_RESEND_AFTER_MS;
    expect(await forget.replay()).toBe(1);
    expect(sent).toHaveLength(3);
  });

  it('un passage traite au plus un lot, et deux passages ne se chevauchent jamais', async () => {
    const store = memoryStore();
    const clock = { now: 1_000_000 };
    const gate: { open: () => void } = { open: () => undefined };
    const opened = new Promise<void>((resolve) => { gate.open = resolve; });
    const forget = translatorForget({ store: { ...store, all: async () => { await opened; return store.all(); } }, now: () => clock.now, send: async () => undefined });
    Array.from({ length: FORGET_REPLAY_BATCH + 20 }, (_, index) => index).forEach((index) => {
      store.rows.set(`r${index}`, JSON.stringify({ requestId: `r${index}`, attachmentIds: [PIECE], messageIds: [], createdAt: clock.now, sentAt: clock.now - FORGET_RESEND_AFTER_MS, attempts: 1 }));
    });
    const first = forget.replay();
    expect(await forget.replay()).toBe(0);
    gate.open();
    expect(await first).toBe(FORGET_REPLAY_BATCH);
  });
});
