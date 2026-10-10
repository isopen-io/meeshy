import { describe, expect, test } from 'bun:test';

import { bindAppStatePresence, type VisibilitySource } from './app-state-presence';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

type Emitted = { readonly event: string; readonly payload: unknown };

function fakeSocket(connected: boolean) {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emitted: Emitted[] = [];
  let connects = 0;
  const socket: SocketClient = {
    connected,
    connect: () => {
      connects += 1;
    },
    disconnect: () => undefined,
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
  return { socket, emitted, fire, listeners, connects: () => connects };
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

  test('un socket resté connecté n’est pas touché', () => {
    const { socket, connects } = fakeSocket(true);
    const visibility = fakeVisibility('visible');
    bindAppStatePresence({ socket, visibility: visibility.source });
    visibility.set('hidden');
    visibility.set('visible');
    expect(connects()).toBe(0);
  });
});
