import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { createWidgetChannel, widgetBridgeOf, WIDGETS_BRIDGE, type WidgetBridge, type WidgetTimers } from './channel';
import type { WidgetSnapshot } from './snapshot';

/**
 * LE DÉBIT DE PUBLICATION VERS LES WIDGETS (#10626) — la page republie sur
 * chaque changement utile, mais au plus une fois par fenêtre de débounce, et
 * jamais un instantané identique au dernier envoyé. Un changement de compte
 * ou une déconnexion VIDE les widgets sur-le-champ : aucun écran d'accueil ne
 * montre les conversations d'un autre compte.
 */
type Call = readonly [string, ...unknown[]];

const fakeBridge = (pending: readonly string[] = []): { bridge: WidgetBridge; calls: Call[] } => {
  const calls: Call[] = [];
  const bridge: WidgetBridge = {
    publish: (json) => {
      calls.push(['publish', json]);
      return Promise.resolve();
    },
    clear: () => {
      calls.push(['clear']);
      return Promise.resolve();
    },
    drainMarkRead: () => {
      calls.push(['drain']);
      return Promise.resolve(pending);
    },
  };
  return { bridge, calls };
};

const fakeTimers = (): WidgetTimers & { fire(): void; armed(): number } => {
  let pending: Array<{ id: number; run: () => void }> = [];
  let next = 1;
  return {
    set: (run) => {
      const id = next++;
      pending = [...pending, { id, run }];
      return id;
    },
    clear: (id) => {
      pending = pending.filter((t) => t.id !== id);
    },
    fire: () => {
      const due = pending;
      pending = [];
      due.forEach((t) => t.run());
    },
    armed: () => pending.length,
  };
};

const snapshot = (unread: number): WidgetSnapshot => ({ v: 1, unread, conversations: [], favorites: [] });

describe('createWidgetChannel — le débit', () => {
  test('un changement attend la fin du débounce, et seul le dernier état part', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', snapshot(1));
    channel.offer('u1', snapshot(2));
    expect(calls.filter(([kind]) => kind === 'publish')).toHaveLength(0);

    timers.fire();
    expect(calls.filter(([kind]) => kind === 'publish')).toEqual([['publish', JSON.stringify(snapshot(2))]]);
  });

  test('un instantané identique au dernier envoyé ne repart pas', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', snapshot(1));
    timers.fire();
    channel.offer('u1', snapshot(1));
    expect(timers.armed()).toBe(0);
    timers.fire();
    expect(calls.filter(([kind]) => kind === 'publish')).toHaveLength(1);
  });

  test('le passage en arrière-plan publie TOUT DE SUITE ce qui attendait', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', snapshot(3));
    channel.flush();
    expect(calls).toEqual([['publish', JSON.stringify(snapshot(3))]]);
    expect(timers.armed()).toBe(0);
  });

  test('un cache pas encore chargé ne publie rien — ni vide, ni fictif', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', undefined);
    timers.fire();
    channel.flush();
    expect(calls).toEqual([]);
  });
});

describe('createWidgetChannel — l’identité (dimension sécurité)', () => {
  test('la déconnexion vide les widgets sur-le-champ, et une seule fois', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', snapshot(1));
    timers.fire();
    channel.offer('u1', snapshot(4));
    channel.offer(null, undefined);
    channel.offer(null, undefined);
    timers.fire();

    expect(calls).toEqual([['publish', JSON.stringify(snapshot(1))], ['clear']]);
  });

  test('changer de compte vide AVANT que le nouveau compte ne publie — même si son cache n’est pas prêt', () => {
    const { bridge, calls } = fakeBridge();
    const timers = fakeTimers();
    const channel = createWidgetChannel({ bridge, timers });

    channel.offer('u1', snapshot(1));
    timers.fire();
    channel.offer('u2', undefined);
    expect(calls.at(-1)).toEqual(['clear']);

    channel.offer('u2', snapshot(1));
    timers.fire();
    expect(calls.at(-1)).toEqual(['publish', JSON.stringify(snapshot(1))]);
  });

  test('au démarrage déconnecté, un instantané laissé par une session précédente est effacé', () => {
    const { bridge, calls } = fakeBridge();
    const channel = createWidgetChannel({ bridge, timers: fakeTimers() });
    channel.offer(null, undefined);
    expect(calls).toEqual([['clear']]);
  });
});

describe('createWidgetChannel — la file « marquer lu » du widget', () => {
  test('la page vide la file et marque lu chaque conversation, pour le compte connecté seulement', async () => {
    const { bridge } = fakeBridge(['c1', 'c2']);
    const channel = createWidgetChannel({ bridge, timers: fakeTimers() });
    const read: string[] = [];

    channel.offer(null, undefined);
    expect(await channel.drainMarkRead((id) => read.push(id))).toBe(0);

    channel.offer('u1', snapshot(2));
    expect(await channel.drainMarkRead((id) => read.push(id))).toBe(2);
    expect(read).toEqual(['c1', 'c2']);
  });
});

describe('widgetBridgeOf', () => {
  test('rien hors d’une coque qui déclare le pont', () => {
    expect(widgetBridgeOf(undefined)).toBeNull();
    expect(widgetBridgeOf({ PluginHeaders: [{ name: 'Autre' }], nativePromise: () => Promise.resolve() })).toBeNull();
  });

  test('le pont relaie publish / clear / drainMarkRead au plugin natif', async () => {
    const appels: Array<readonly [string, string, object]> = [];
    const coque: CoqueNative = {
      PluginHeaders: [{ name: WIDGETS_BRIDGE, methods: [{ name: 'publish' }, { name: 'clear' }, { name: 'drainMarkRead' }] }],
      nativePromise: (plugin, methode, options) => {
        appels.push([plugin, methode, options]);
        return Promise.resolve(methode === 'drainMarkRead' ? { ids: ['c9', 4, null] } : undefined);
      },
    };
    const bridge = widgetBridgeOf(coque);
    await bridge?.publish('{"v":1}');
    await bridge?.clear();
    expect(await bridge?.drainMarkRead()).toEqual(['c9']);
    expect(appels).toEqual([
      [WIDGETS_BRIDGE, 'publish', { json: '{"v":1}' }],
      [WIDGETS_BRIDGE, 'clear', {}],
      [WIDGETS_BRIDGE, 'drainMarkRead', {}],
    ]);
  });
});
