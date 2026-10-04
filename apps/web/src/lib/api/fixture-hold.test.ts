import { afterEach, describe, expect, test } from 'bun:test';

import { ARCHIVE_CONVERSATION_ID, ARCHIVE_STARRED_ID } from './fixtures-archive';
import { FIXTURE_HOLD_GLOBAL } from './fixture-hold';
import { createHttpTransport } from './http';
import { loadMessagesWindow } from './messages-window';

/**
 * #9302 — LES GATES RETIENNENT UNE RÉPONSE DE FIXTURES. Le client de fixtures
 * sert sur-le-champ : aucun navigateur ne pouvait donc observer l'état « en
 * vol » de la fenêtre `?around=`. Un gate pose une RETENUE (`addInitScript`)
 * et la relâche quand il a lu ce qu'il juge — un FAIT, jamais une durée
 * (`fixed-delay-ratchet`). Sans retenue posée, rien ne change.
 */
type HoldHost = Record<string, unknown>;
const host = globalThis as unknown as HoldHost;

afterEach(() => {
  delete host[FIXTURE_HOLD_GLOBAL];
});

const load = () =>
  loadMessagesWindow({
    source: 'fixtures',
    transport: createHttpTransport({ base: '', fetchImpl: () => Promise.reject(new Error('aucun réseau sous fixtures')) }),
    conversationId: ARCHIVE_CONVERSATION_ID,
    param: { around: ARCHIVE_STARRED_ID },
  });

describe('fixture-hold (#9302)', () => {
  test('sans retenue posée, la fenêtre de fixtures se sert comme avant', async () => {
    const result = await load();
    expect(result.ok).toBe(true);
  });

  test('une retenue posée tient la fenêtre jusqu’à ce que le gate la relâche, en nommant ce qu’elle retient', async () => {
    const asked: string[] = [];
    let release: () => void = () => {};
    host[FIXTURE_HOLD_GLOBAL] = (channel: string, detail: string) => {
      asked.push(`${channel}:${detail}`);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    let served = false;
    const pending = load().then((result) => {
      served = result.ok;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(served).toBe(false);
    expect(asked).toEqual(['messages-window:around']);
    release();
    await pending;
    expect(served).toBe(true);
  });

  test('une retenue qui décline (rien de rendu) laisse passer', async () => {
    host[FIXTURE_HOLD_GLOBAL] = () => undefined;
    const result = await load();
    expect(result.ok).toBe(true);
  });
});
