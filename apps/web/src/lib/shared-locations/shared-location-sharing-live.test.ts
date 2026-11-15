import { describe, expect, test } from 'bun:test';

import { createSessionStore } from '@/lib/api/session';
import type { LiveSocketWatcher } from '@/lib/api/live-socket-watchers';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

import { browserSharedLocationFixSource, createSharedLocationSharingHolder, socketSharedLocationEmitter } from './shared-location-sharing-live';

/**
 * **LE CENTRE BRANCHÉ** (#18345) : le fil `location:share-*` avec son accusé, la
 * géolocalisation du navigateur, et un centre par compte connecté.
 */

const AMI = 'a'.repeat(24);
const PARIS = { latitude: 48.8566, longitude: 2.3522, accuracy: 12 };

function fakeSocket({ connected = true, reply }: { readonly connected?: boolean; readonly reply: (event: string, payload: unknown) => Promise<unknown> }) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const handlers = new Map<string, SocketHandler[]>();
  const socket: SocketClient = {
    connected,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => void handlers.set(event, [...(handlers.get(event) ?? []), handler as SocketHandler]),
    off: (event, handler) => void handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler)),
    emit: () => undefined,
    emitWithAck: (event, payload) => {
      emitted.push({ event, payload });
      return reply(event, payload);
    },
  };
  return { socket, emitted, fire: (event: string, payload: unknown = undefined) => (handlers.get(event) ?? []).forEach((h) => h(payload)) };
}

describe('le fil', () => {
  test('location:share-start part avec son accusé, et le terme servi est lu', async () => {
    const { socket, emitted } = fakeSocket({ reply: async () => ({ success: true, data: { expiresAt: '2026-11-14T09:00:00.000Z' } }) });
    const verdict = await socketSharedLocationEmitter(() => socket).start({ recipients: [{ userId: AMI, precision: 'city' }], durationMinutes: 60, position: PARIS });
    expect(emitted[0]?.event).toBe('location:share-start');
    expect(verdict.kind).toBe('started');
  });

  test('socket absente ou fermée : hors ligne, rien ne part', async () => {
    const { socket, emitted } = fakeSocket({ connected: false, reply: async () => ({ success: true }) });
    expect(await socketSharedLocationEmitter(() => socket).update(PARIS)).toEqual({ kind: 'refused', outcome: 'offline' });
    expect(await socketSharedLocationEmitter(() => null).stop()).toBe(false);
    expect(emitted).toHaveLength(0);
  });

  test('un accusé qui ne revient pas vaut un envoi INCERTAIN, jamais « rien n’est parti »', async () => {
    const { socket } = fakeSocket({ reply: () => Promise.reject(new Error('timeout')) });
    const emitter = socketSharedLocationEmitter(() => socket);
    expect(await emitter.start({ recipients: [{ userId: AMI, precision: 'city' }], durationMinutes: 60, position: PARIS })).toEqual({ kind: 'refused', outcome: 'unconfirmed' });
    expect(await emitter.stop()).toBe(false);
  });

  test('seul un succès explicite vaut un arrêt', async () => {
    const { socket } = fakeSocket({ reply: async () => ({ success: false, code: 'SHARED_LOCATION_UNAVAILABLE' }) });
    expect(await socketSharedLocationEmitter(() => socket).stop()).toBe(false);
  });
});

describe('la géolocalisation du navigateur', () => {
  test('la permission ne se lit que si le navigateur la dit accordée, sans jamais la demander', async () => {
    const permissions = (state: string) => ({ query: async () => ({ state }) }) as unknown as Permissions;
    expect(await browserSharedLocationFixSource(undefined, permissions('granted')).isGranted()).toBe(true);
    expect(await browserSharedLocationFixSource(undefined, permissions('prompt')).isGranted()).toBe(false);
    expect(await browserSharedLocationFixSource(undefined, undefined).isGranted()).toBe(false);
  });

  const geolocation = (outcome: { position?: GeolocationPosition; code?: number }): Geolocation =>
    ({
      getCurrentPosition: (ok: PositionCallback, ko?: PositionErrorCallback | null) =>
        outcome.position !== undefined ? ok(outcome.position) : ko?.({ code: outcome.code ?? 2 } as GeolocationPositionError),
      watchPosition: () => 7,
      clearWatch: () => undefined,
    }) as unknown as Geolocation;

  test('un refus de permission se dit « refusé », le reste « indisponible »', async () => {
    expect(await browserSharedLocationFixSource(geolocation({ code: 1 })).currentFix()).toEqual({ kind: 'denied' });
    expect(await browserSharedLocationFixSource(geolocation({ code: 3 })).currentFix()).toEqual({ kind: 'unavailable' });
    expect(await browserSharedLocationFixSource(undefined).currentFix()).toEqual({ kind: 'unavailable' });
  });

  test('un relevé valide devient une position bornée', async () => {
    const position = { coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 } } as GeolocationPosition;
    expect(await browserSharedLocationFixSource(geolocation({ position })).currentFix()).toEqual({ kind: 'fix', fix: PARIS });
  });
});

describe('un centre par compte connecté', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  };
  const signIn = (session: ReturnType<typeof createSessionStore>, id: string) =>
    session.getState().establish({ user: { id, username: id, displayName: null, avatar: null } as never, token: 't', sessionToken: 's', expiresIn: 3600 });

  test('sans compte, aucun centre ; un autre compte repart d’un centre neuf', () => {
    const session = createSessionStore({ storage: memory() });
    const watchers: LiveSocketWatcher[] = [];
    const holder = createSharedLocationSharingHolder({ session, watch: (w) => (watchers.push(w), () => undefined), storage: memory() });
    expect(holder()).toBeNull();
    signIn(session, AMI);
    const first = holder();
    expect(first).not.toBeNull();
    expect(holder()).toBe(first);
    signIn(session, 'b'.repeat(24));
    expect(holder()).not.toBe(first);
  });

  test('une socket qui s’accroche solde les échéances (location:share-stop d’une liste échue)', async () => {
    const session = createSessionStore({ storage: memory() });
    signIn(session, AMI);
    const storage = memory();
    storage.setItem(`meeshy.shared-location.roster.u_${AMI}`, JSON.stringify({ ['b'.repeat(24)]: { precision: 'city', until: 1 } }));
    let watcher: LiveSocketWatcher | null = null;
    const holder = createSharedLocationSharingHolder({
      session,
      watch: (w) => ((watcher = w), () => undefined),
      storage,
      fixes: { isGranted: async () => false, currentFix: async () => ({ kind: 'denied' }), follow: () => () => undefined },
      schedule: () => () => undefined,
      served: async () => null,
    });
    holder();
    const { socket, emitted } = fakeSocket({ reply: async () => ({ success: true }) });
    (watcher as LiveSocketWatcher | null)?.(socket);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(emitted.map((e) => e.event)).toEqual(['location:share-stop']);
    expect(storage.getItem(`meeshy.shared-location.roster.u_${AMI}`)).toBeNull();
  });
});

describe('plusieurs appareils, un partage (#18389)', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  };
  const PROCHE = 'b'.repeat(24);
  const AJOUTE_AILLEURS = 'd'.repeat(24);
  const rosterKey = `meeshy.shared-location.roster.u_${AMI}`;
  const later = (ms: number) => new Date(Date.now() + ms).toISOString();

  const holderWith = ({ storage, served }: { readonly storage: ReturnType<typeof memory>; readonly served: () => Promise<unknown> }) => {
    const session = createSessionStore({ storage: memory() });
    session.getState().establish({ user: { id: AMI, username: AMI, displayName: null, avatar: null } as never, token: 't', sessionToken: 's', expiresIn: 3600 });
    let watcher: LiveSocketWatcher | null = null;
    const holder = createSharedLocationSharingHolder({
      session,
      watch: (w) => ((watcher = w), () => undefined),
      storage,
      fixes: { isGranted: async () => true, currentFix: async () => ({ kind: 'fix', fix: PARIS }), follow: () => () => undefined },
      schedule: () => () => undefined,
      served: served as never,
    });
    return { center: holder(), attach: (socket: SocketClient) => (watcher as LiveSocketWatcher | null)?.(socket) };
  };
  const settle = async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  };

  test('à la connexion, l’onglet se recale AVANT de rejouer son retrait : l’ajout fait ailleurs n’est pas effacé', async () => {
    const storage = memory();
    storage.setItem(`${rosterKey}.withdrawals`, JSON.stringify({ [PROCHE]: Date.now() + 8 * 3_600_000 }));
    const served = async () => ({
      recipients: [{ userId: PROCHE, precision: 'city', expiresAt: later(3_600_000) }, { userId: AJOUTE_AILLEURS, precision: 'exact', expiresAt: later(3_600_000) }],
      expiresAt: later(3_600_000),
    });
    const { attach } = holderWith({ storage, served });
    const { socket, emitted } = fakeSocket({ reply: async () => ({ success: true, data: { expiresAt: later(3_600_000) } }) });
    attach(socket);
    await settle();
    expect(emitted.map((e) => e.event)).toEqual(['location:share-start']);
    expect((emitted[0]?.payload as { recipients: { userId: string }[] }).recipients.map((r) => r.userId)).toEqual([AJOUTE_AILLEURS]);
  });

  test('location:share-own-changed recale l’onglet : une personne retirée sur un autre appareil sort d’ici', async () => {
    const storage = memory();
    storage.setItem(rosterKey, JSON.stringify({ [PROCHE]: { precision: 'city', until: Date.now() + 3_600_000 } }));
    let truth: unknown = { recipients: [{ userId: PROCHE, precision: 'city', expiresAt: later(3_600_000) }], expiresAt: later(3_600_000) };
    const { center, attach } = holderWith({ storage, served: async () => truth });
    const { socket, emitted, fire } = fakeSocket({ reply: async () => ({ success: true }) });
    attach(socket);
    await settle();
    expect(center?.entry(PROCHE)).not.toBeNull();

    truth = { recipients: [], expiresAt: null };
    fire('location:share-own-changed', {});
    await settle();
    expect(center?.entry(PROCHE)).toBeNull();
    expect(storage.getItem(rosterKey)).toBeNull();
    expect(emitted).toEqual([]);
  });
});
