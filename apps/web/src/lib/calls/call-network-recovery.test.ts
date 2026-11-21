import { describe, expect, test } from 'bun:test';

import { createNetworkRecovery, NETWORK_RECOVERY_COOLDOWN_MS, watchNetworkPath } from './call-network-recovery';

/**
 * UN APPEL SURVIT À UN CHANGEMENT DE RÉSEAU (#19776) — le Wi-Fi qui cède à la
 * 4G change l'adresse de l'appareil : la socket de signalisation et les paires
 * ICE d'avant sont mortes sans le savoir. Le moteur recycle la socket et
 * relance ICE sur chaque lien dès que le CHEMIN change — pas à chaque
 * estimation de débit, que `navigator.connection` annonce par le même
 * événement `change`.
 */

function fakeHost(type?: string) {
  const windowListeners = new Map<string, Set<() => void>>();
  const connectionListeners = new Set<() => void>();
  const connection = {
    type,
    addEventListener: (_event: string, listener: () => void) => void connectionListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => void connectionListeners.delete(listener),
  };
  const host = {
    window: {
      addEventListener: (event: string, listener: () => void) => void windowListeners.set(event, new Set([...(windowListeners.get(event) ?? []), listener])),
      removeEventListener: (event: string, listener: () => void) => void windowListeners.get(event)?.delete(listener),
    },
    connection,
  };
  const online = () => (windowListeners.get('online') ?? new Set()).forEach((listener) => listener());
  const change = (next?: string) => {
    connection.type = next;
    connectionListeners.forEach((listener) => listener());
  };
  const listening = () => (windowListeners.get('online')?.size ?? 0) + connectionListeners.size;
  return { host, online, change, listening };
}

describe('le chemin réseau', () => {
  test('le retour en ligne est un changement de chemin', () => {
    const fake = fakeHost('wifi');
    const seen: string[] = [];
    watchNetworkPath(fake.host, () => void seen.push('path'));
    fake.online();
    expect(seen).toEqual(['path']);
  });

  test('le Wi-Fi qui cède au cellulaire en est un ; une estimation de débit sur le même chemin n’en est pas un', () => {
    const fake = fakeHost('wifi');
    const seen: string[] = [];
    watchNetworkPath(fake.host, () => void seen.push('path'));
    fake.change('wifi');
    expect(seen).toEqual([]);
    fake.change('cellular');
    expect(seen).toEqual(['path']);
  });

  test('perdre tout réseau n’est rien à reprendre ; le retrouver l’est', () => {
    const fake = fakeHost('wifi');
    const seen: string[] = [];
    watchNetworkPath(fake.host, () => void seen.push('path'));
    fake.change('none');
    expect(seen).toEqual([]);
    fake.change('wifi');
    expect(seen).toEqual(['path']);
  });

  test('un navigateur qui ne dit pas le type de connexion (bureau, Safari) n’écoute que le retour en ligne', () => {
    const fake = fakeHost(undefined);
    const seen: string[] = [];
    watchNetworkPath(fake.host, () => void seen.push('path'));
    fake.change(undefined);
    expect(seen).toEqual([]);
    fake.online();
    expect(seen).toEqual(['path']);
  });

  test('sans connexion annoncée ni fenêtre, rien n’est écouté et le désabonnement tient', () => {
    expect(() => watchNetworkPath({ window: null, connection: null }, () => undefined)()).not.toThrow();
  });

  test('le désabonnement retire les deux écoutes', () => {
    const fake = fakeHost('wifi');
    const unwatch = watchNetworkPath(fake.host, () => undefined);
    expect(fake.listening()).toBe(2);
    unwatch();
    expect(fake.listening()).toBe(0);
  });
});

describe('la reprise d’un appel', () => {
  const recovery = () => {
    const done: string[] = [];
    const clock = { now: 10_000 };
    const links = [{ restartIce: () => void done.push('ice:a') }, { restartIce: () => void done.push('ice:b') }];
    const recover = createNetworkRecovery({ now: () => clock.now, reconnect: () => void done.push('socket'), links: () => links });
    return { done, clock, recover };
  };

  test('la socket est recyclée, puis ICE relancé sur CHAQUE lien', () => {
    const { done, recover } = recovery();
    recover();
    expect(done).toEqual(['socket', 'ice:a', 'ice:b']);
  });

  test('les signaux d’un même changement (online + change) ne relancent qu’une fois', () => {
    const { done, clock, recover } = recovery();
    recover();
    clock.now += NETWORK_RECOVERY_COOLDOWN_MS - 1;
    recover();
    expect(done.filter((step) => step === 'socket')).toHaveLength(1);
    clock.now += 1;
    recover();
    expect(done.filter((step) => step === 'socket')).toHaveLength(2);
  });
});
