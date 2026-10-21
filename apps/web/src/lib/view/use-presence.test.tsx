import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createPresenceStore } from '@/lib/api/presence-store';
import type { Participant } from '@/lib/api/types';

import type { IntervalClock } from './interval-clock';
import { usePresence, usePresenceOf, usePresenceOfUser, type PresenceSubject } from './use-presence';

/**
 * LA PASTILLE SUIT LE TEMPS RÉEL ET DÉCROÎT D'ELLE-MÊME (#10571) — et ne se
 * repeint que quand SA présence change.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  const mounted = root;
  if (mounted !== null) act(() => mounted.unmount());
  container?.remove();
  root = null;
  container = null;
});

const T0 = Date.parse('2026-10-13T12:00:00.000Z');

const participant = (partial: Partial<Participant>): Participant =>
  ({
    id: 'p-bob',
    conversationId: 'c1',
    userId: 'user-bob',
    type: 'user',
    role: 'member',
    displayName: 'Bob',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: new Date(T0 - 3_600_000),
    ...partial,
  }) as Participant;

function manualClock() {
  const listeners = new Set<(now: number) => void>();
  const clock: IntervalClock = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { clock, tick: (now: number) => listeners.forEach((listener) => listener(now)) };
}

function mount(bob: Participant) {
  const store = createPresenceStore();
  const { clock, tick } = manualClock();
  let at = T0;
  let renders = 0;
  const seen: string[] = [];
  function Dot() {
    renders += 1;
    const status = usePresence(bob, { now: () => at, store, clock });
    seen.push(status);
    return <span data-status={status} />;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(<Dot />));
  return {
    store,
    status: () => seen[seen.length - 1],
    renders: () => renders,
    advanceTo: (next: number) => {
      at = next;
      act(() => tick(next));
    },
  };
}

describe('usePresence', () => {
  test('sans présence vivante, la charge REST décide', () => {
    const view = mount(participant({ isOnline: true, lastActiveAt: new Date(T0) }));

    expect(view.status()).toBe('online');
  });

  test('un user:status servi prime sur la charge REST figée', () => {
    const view = mount(participant({ isOnline: true, lastActiveAt: new Date(T0) }));

    act(() => view.store.getState().put('user-bob', { isOnline: false, lastActiveAt: new Date(T0 - 20 * 60_000).toISOString() }));

    expect(view.status()).toBe('offline');
  });

  test('la pastille décroît en ligne → absent → inactif → rien, sans aucun événement', () => {
    const view = mount(participant({}));
    act(() => view.store.getState().put('user-bob', { isOnline: false, lastActiveAt: new Date(T0).toISOString() }));

    view.advanceTo(T0 + 2 * 60_000);
    expect(view.status()).toBe('away');
    view.advanceTo(T0 + 4 * 60_000);
    expect(view.status()).toBe('idle');
    view.advanceTo(T0 + 6 * 60_000);
    expect(view.status()).toBe('offline');
  });

  test('ni le battement de l’horloge ni la présence d’un autre ne repeignent une pastille inchangée', () => {
    const view = mount(participant({}));
    act(() => view.store.getState().put('user-bob', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));
    const before = view.renders();

    view.advanceTo(T0 + 30_000);
    act(() => view.store.getState().put('user-carol', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.renders()).toBe(before);
  });
});

function mountUser(userId: string | undefined) {
  const store = createPresenceStore();
  const { clock, tick } = manualClock();
  let at = T0;
  let renders = 0;
  const seen: string[] = [];
  function Dot() {
    renders += 1;
    const status = usePresenceOfUser(userId, { now: () => at, store, clock });
    seen.push(status);
    return <span data-status={status} />;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(<Dot />));
  return {
    store,
    status: () => seen[seen.length - 1],
    renders: () => renders,
    advanceTo: (next: number) => {
      at = next;
      act(() => tick(next));
    },
  };
}

/**
 * LA PRÉSENCE D'UNE PERSONNE CONNUE PAR SON SEUL IDENTIFIANT (#10944) — le fil,
 * les commentaires, les notifications : la charge n'en porte aucune, la carte
 * vivante est la seule présence SERVIE, et rien ne se fabrique sans elle.
 */
describe('usePresenceOfUser', () => {
  test('absente de la carte vivante, la personne ne porte aucune présence', () => {
    const view = mountUser('user-bob');

    expect(view.status()).toBe('offline');
  });

  test('sans identifiant, aucune présence, même quand la carte en porte', () => {
    const view = mountUser(undefined);

    act(() => view.store.getState().put('user-bob', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.status()).toBe('offline');
  });

  test('un user:status servi allume la pastille, et elle décroît d’elle-même', () => {
    const view = mountUser('user-bob');

    act(() => view.store.getState().put('user-bob', { isOnline: false, lastActiveAt: new Date(T0).toISOString() }));
    expect(view.status()).toBe('online');

    view.advanceTo(T0 + 2 * 60_000);
    expect(view.status()).toBe('away');
  });

  test('la présence d’un autre ne repeint pas la pastille', () => {
    const view = mountUser('user-bob');
    const before = view.renders();

    act(() => view.store.getState().put('user-carol', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.renders()).toBe(before);
  });
});

function mountSubject(subject: PresenceSubject) {
  const store = createPresenceStore();
  const { clock, tick } = manualClock();
  let at = T0;
  let renders = 0;
  const seen: string[] = [];
  function Dot() {
    renders += 1;
    const status = usePresenceOf(subject, { now: () => at, store, clock });
    seen.push(status);
    return <span data-status={status} />;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(<Dot />));
  return {
    store,
    status: () => seen[seen.length - 1],
    renders: () => renders,
    advanceTo: (next: number) => {
      at = next;
      act(() => tick(next));
    },
  };
}

/**
 * UNE PERSONNE NOMMÉE PAR SON IDENTIFIANT, SA CHARGE REST PEUT-ÊTRE (#11412) —
 * un membre actif hors des participants servis, un visage de la rampe : la
 * carte vivante par l'identifiant d'abord, la charge REST sinon, décroissant
 * avec l'horloge.
 */
describe('usePresenceOf', () => {
  test('sans participant servi, la carte vivante de l’identifiant allume la pastille', () => {
    const view = mountSubject({ userId: 'user-bob', participant: undefined });

    act(() => view.store.getState().put('user-bob', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.status()).toBe('online');
  });

  test('sans entrée vivante, la charge REST décide et décroît avec l’horloge', () => {
    const view = mountSubject({ userId: 'user-bob', participant: participant({ isOnline: false, lastActiveAt: new Date(T0) }) });

    expect(view.status()).toBe('online');
    view.advanceTo(T0 + 2 * 60_000);
    expect(view.status()).toBe('away');
  });

  test('l’identifiant nommé prime sur la clé du participant', () => {
    const view = mountSubject({ userId: 'user-bob', participant: participant({ userId: 'user-other' }) });

    act(() => view.store.getState().put('user-bob', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.status()).toBe('online');
  });

  test('la présence d’un autre ne repeint pas la pastille', () => {
    const view = mountSubject({ userId: 'user-bob', participant: undefined });
    const before = view.renders();

    act(() => view.store.getState().put('user-carol', { isOnline: true, lastActiveAt: new Date(T0).toISOString() }));

    expect(view.renders()).toBe(before);
  });
});
