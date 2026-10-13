import { describe, expect, test } from 'bun:test';

import { bindAppStatePresence, WAKE_AFTER_HIDDEN_MS, type VisibilitySource } from './app-state-presence';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

type Emitted = { readonly event: string; readonly payload: unknown };

function fakeSocket(connected: boolean) {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emitted: Emitted[] = [];
  let connects = 0;
  let disconnects = 0;
  const socket: SocketClient = {
    connected,
    connect: () => {
      connects += 1;
    },
    disconnect: () => {
      disconnects += 1;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
  };
  const fire = (event: string): void => {
    for (const handler of handlers.get(event) ?? []) handler(undefined);
  };
  const listeners = (event: string): number => handlers.get(event)?.size ?? 0;
  return { socket, emitted, fire, listeners, connects: () => connects, disconnects: () => disconnects };
}

function fakeClock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => void (at += ms) };
}

function fakeVisibility(initial: 'visible' | 'hidden') {
  let state: 'visible' | 'hidden' = initial;
  const handlers = new Set<() => void>();
  const source: VisibilitySource = {
    visibilityState: () => state,
    onChange: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  const set = (next: 'visible' | 'hidden'): void => {
    state = next;
    for (const handler of handlers) handler();
  };
  return { source, set, count: () => handlers.size };
}

const appStates = (emitted: readonly Emitted[]) => emitted.filter((entry) => entry.event === 'presence:app-state').map((entry) => entry.payload);

describe('presence:app-state — la passerelle sait si l’onglet est au premier plan', () => {
  test('à l’authentification du socket, l’état courant de l’onglet part', () => {
    const { socket, emitted, fire } = fakeSocket(false);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    expect(appStates(emitted)).toEqual([]);
    fire('authenticated');
    expect(appStates(emitted)).toEqual([{ foreground: true }]);
  });

  test('un onglet caché à la connexion se déclare en arrière-plan', () => {
    const { socket, emitted, fire } = fakeSocket(false);
    const visibility = fakeVisibility('hidden');
    bindAppStatePresence({ socket, visibility: visibility.source });
    fire('authenticated');
    expect(appStates(emitted)).toEqual([{ foreground: false }]);
  });

  test('un socket déjà connecté au branchement reçoit l’état tout de suite', () => {
    const { socket, emitted } = fakeSocket(true);
    bindAppStatePresence({ socket, visibility: fakeVisibility('visible').source });
    expect(appStates(emitted)).toEqual([{ foreground: true }]);
  });

  test('chaque changement de visibilité part, sans doublon', () => {
    const { socket, emitted, fire } = fakeSocket(false);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    fire('authenticated');
    visibility.set('hidden');
    visibility.set('hidden');
    visibility.set('visible');
    expect(appStates(emitted)).toEqual([{ foreground: true }, { foreground: false }, { foreground: true }]);
  });

  test('un changement de visibilité hors connexion ne part pas', () => {
    const { socket, emitted } = fakeSocket(false);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    visibility.set('hidden');
    expect(appStates(emitted)).toEqual([]);
  });

  test('le débranchement retire les deux écouteurs', () => {
    const { socket, listeners } = fakeSocket(false);
    const visibility = fakeVisibility('visible');
    const unbind = bindAppStatePresence({ socket, visibility: visibility.source });
    expect(listeners('authenticated')).toBe(1);
    expect(visibility.count()).toBe(1);
    unbind();
    expect(listeners('authenticated')).toBe(0);
    expect(visibility.count()).toBe(0);
  });
});

describe('le retour au premier plan rebranche le temps réel (#8839)', () => {
  test('la page redevenue visible avec un socket coupé relance la connexion', () => {
    const { socket, connects } = fakeSocket(false);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    visibility.set('hidden');
    expect(connects()).toBe(0);
    visibility.set('visible');
    expect(connects()).toBe(1);
  });

  test('un socket resté connecté n’est pas touché après une absence brève', () => {
    const { socket, connects } = fakeSocket(true);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    visibility.set('hidden');
    visibility.set('visible');
    expect(connects()).toBe(0);
  });
});

/**
 * #10573 — l'onglet ENDORMI. Un navigateur gèle les minuteurs d'un onglet
 * caché ; au réveil, `socket.connected` dit encore vrai pendant que la
 * connexion est morte (jusqu'à ~45 s avant que le battement ne le découvre),
 * et tout ce qui est parti pendant le sommeil était perdu. Une absence d'au
 * moins `WAKE_AFTER_HIDDEN_MS` force une connexion neuve — son
 * `authenticated` rejoue le rattrapage de `socket.ts` — et relit la liste.
 */
describe('le retour d’un onglet endormi rattrape ce qu’il a manqué (#10573)', () => {
  const sleep = (hiddenMs: number, connected: boolean) => {
    const fake = fakeSocket(connected);
    const visibility = fakeVisibility('visible');
    const clock = fakeClock();
    let wakes = 0;
    bindAppStatePresence({ socket: fake.socket, visibility: visibility.source, now: clock.now, onWake: () => void (wakes += 1) });
    visibility.set('hidden');
    clock.advance(hiddenMs);
    visibility.set('visible');
    return { ...fake, wakes: () => wakes };
  };

  test('un socket qui se dit connecté après un long sommeil est rouvert', () => {
    const { connects, disconnects } = sleep(WAKE_AFTER_HIDDEN_MS, true);
    expect([disconnects(), connects()]).toEqual([1, 1]);
  });

  test('un long sommeil relit la liste', () => {
    expect(sleep(WAKE_AFTER_HIDDEN_MS, true).wakes()).toBe(1);
  });

  test('un socket coupé est seulement rouvert, jamais coupé une seconde fois', () => {
    const { connects, disconnects, wakes } = sleep(60_000, false);
    expect([disconnects(), connects(), wakes()]).toEqual([0, 1, 1]);
  });

  test('une absence brève ne coûte ni reconnexion ni relecture', () => {
    const { connects, disconnects, wakes } = sleep(WAKE_AFTER_HIDDEN_MS - 1, true);
    expect([disconnects(), connects(), wakes()]).toEqual([0, 0, 0]);
  });

  test('le sommeil se compte depuis le PREMIER passage en arrière-plan', () => {
    const fake = fakeSocket(true);
    const visibility = fakeVisibility('visible');
    const clock = fakeClock();
    bindAppStatePresence({ socket: fake.socket, visibility: visibility.source, now: clock.now });
    visibility.set('hidden');
    clock.advance(WAKE_AFTER_HIDDEN_MS / 2);
    visibility.set('hidden');
    clock.advance(WAKE_AFTER_HIDDEN_MS / 2);
    visibility.set('visible');
    expect(fake.disconnects()).toBe(1);
  });

  test('un onglet branché caché, puis montré longtemps après, se réveille', () => {
    const fake = fakeSocket(true);
    const visibility = fakeVisibility('hidden');
    const clock = fakeClock();
    bindAppStatePresence({ socket: fake.socket, visibility: visibility.source, now: clock.now });
    clock.advance(WAKE_AFTER_HIDDEN_MS);
    visibility.set('visible');
    expect(fake.disconnects()).toBe(1);
  });

  test('un second retour au premier plan sans nouveau sommeil ne rouvre rien', () => {
    const fake = fakeSocket(true);
    const visibility = fakeVisibility('visible');
    const clock = fakeClock();
    bindAppStatePresence({ socket: fake.socket, visibility: visibility.source, now: clock.now });
    visibility.set('hidden');
    clock.advance(WAKE_AFTER_HIDDEN_MS);
    visibility.set('visible');
    clock.advance(WAKE_AFTER_HIDDEN_MS);
    visibility.set('visible');
    expect(fake.disconnects()).toBe(1);
  });
});
