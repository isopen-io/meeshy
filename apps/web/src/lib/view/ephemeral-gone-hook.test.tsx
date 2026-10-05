import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Message } from '@/lib/api/types';

import { DESTRUCTION_MS } from './ephemeral-destruction';
import { useLivingMessages, type Schedule } from './ephemeral-gone';
import { configureEphemeralReceptionStorage, noteEphemeralReception, resetEphemeralReception } from './ephemeral-reception';

/**
 * **LA RANGÉE PARTIE QUITTE LE FIL À L'HEURE, MÊME HORS ÉCRAN** (#8900, trou
 * 3) — le crochet se réveille seul à l'échéance plus la combustion ; aucun
 * chrome n'a besoin de l'annoncer. Horloge et minuterie injectées.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const T0 = Date.parse('2026-09-30T10:00:00.000Z');

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'texte',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date(T0),
    ...partial,
  }) as Message;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  configureEphemeralReceptionStorage(null, T0);
  resetEphemeralReception();
});

const EMPTY: ReadonlySet<string> = new Set();
const notMine = (): boolean => false;

describe('useLivingMessages (#8900)', () => {
  test('l’éphémère reçu sort du DOM à son échéance plus la combustion, le reste demeure', () => {
    configureEphemeralReceptionStorage(null, T0);
    noteEphemeralReception('m-eph', T0);
    const messages = [messageOf({ id: 'm-eph', ephemeralDuration: 60 }), messageOf({ id: 'm-ord' })];
    let clockNow = T0;
    const pending: { run: () => void; ms: number }[] = [];
    const schedule: Schedule = (run, ms) => {
      const entry = { run, ms };
      pending.push(entry);
      return () => {
        pending.splice(pending.indexOf(entry), 1);
      };
    };

    function Fil() {
      const living = useLivingMessages({ messages, isMine: notMine, destroyingIds: EMPTY, expiredIds: EMPTY, clock: () => clockNow, schedule });
      return (
        <ol>
          {living.map((m) => (
            <li key={m.id} data-row={m.id} />
          ))}
        </ol>
      );
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Fil />));

    expect([...container.querySelectorAll('[data-row]')].map((el) => el.getAttribute('data-row'))).toEqual(['m-eph', 'm-ord']);
    expect(pending.map((p) => p.ms)).toEqual([60_000 + DESTRUCTION_MS]);

    clockNow = T0 + 60_000 + DESTRUCTION_MS;
    act(() => pending[0]?.run());

    expect([...container.querySelectorAll('[data-row]')].map((el) => el.getAttribute('data-row'))).toEqual(['m-ord']);
    expect(pending).toEqual([]);
  });
});
