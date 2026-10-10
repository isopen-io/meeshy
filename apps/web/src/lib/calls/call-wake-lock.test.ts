import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { bindCallWakeLock, type WakeLockLike, type WakeLockSentinelLike } from './call-wake-lock';
import { createCallStore, type ActiveCall, type CallPhase } from './call-store';

/**
 * L'ÉCRAN RESTE ALLUMÉ PENDANT UN APPEL (#8701) — la coque Android pose
 * `FLAG_KEEP_SCREEN_ON`, iOS `isIdleTimerDisabled` ; le web demande un verrou
 * d'écran tant que l'appel vit, et le redemande au retour au premier plan.
 */

const call = (phase: CallPhase): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'conv-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase,
  connectedAt: null,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
});

type FakeLock = WakeLockLike & {
  readonly requests: () => number;
  readonly held: () => readonly (WakeLockSentinelLike & { readonly drop: () => void })[];
};

const fakeWakeLock = ({ refuse = false }: { readonly refuse?: boolean } = {}): FakeLock => {
  const sentinels: (WakeLockSentinelLike & { readonly drop: () => void })[] = [];
  let count = 0;
  return {
    request: () => {
      count += 1;
      if (refuse) return Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
      let released = false;
      const sentinel = {
        get released() {
          return released;
        },
        release: () => {
          released = true;
          return Promise.resolve();
        },
        drop: () => {
          released = true;
        },
      };
      sentinels.push(sentinel);
      return Promise.resolve(sentinel);
    },
    requests: () => count,
    held: () => sentinels.filter((sentinel) => !sentinel.released),
  };
};

const visibility = () => {
  let visible = true;
  const listeners = new Set<() => void>();
  return {
    visible: () => visible,
    onVisibilityChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (value: boolean) => {
      visible = value;
      listeners.forEach((listener) => listener());
    },
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (options: { readonly refuse?: boolean } = {}) => {
  const store = createCallStore();
  const wakeLock = fakeWakeLock(options);
  const page = visibility();
  const stop = bindCallWakeLock({ wakeLock, store, visible: page.visible, onVisibilityChange: page.onVisibilityChange });
  const phase = (next: CallPhase | null) => store.setState({ call: next === null ? null : call(next) });
  return { wakeLock, page, stop, phase, store };
};

describe("bindCallWakeLock — l'écran reste allumé tant que l'appel vit", () => {
  test('un appel qui se connecte demande un verrou d’écran', async () => {
    const { wakeLock, phase } = setup();
    phase({ kind: 'connecting' });
    await settle();
    expect(wakeLock.held()).toHaveLength(1);
  });

  test('une sonnerie entrante ne retient pas l’écran : seul un appel vivant le fait', async () => {
    const { wakeLock, phase } = setup();
    phase({ kind: 'incoming' });
    await settle();
    expect(wakeLock.requests()).toBe(0);
  });

  test('la fin de l’appel relâche le verrou', async () => {
    const { wakeLock, phase } = setup();
    phase({ kind: 'connected' });
    await settle();
    phase({ kind: 'ended', reason: 'local', detail: null });
    await settle();
    expect(wakeLock.held()).toHaveLength(0);
  });

  test('les changements du magasin pendant l’appel ne redemandent pas un verrou déjà tenu', async () => {
    const { wakeLock, phase, store } = setup();
    phase({ kind: 'connected' });
    await settle();
    store.setState({ call: { ...call({ kind: 'connected' }), micMuted: true } });
    store.setState({ call: { ...call({ kind: 'connected' }), cameraOn: false } });
    await settle();
    expect(wakeLock.requests()).toBe(1);
  });

  test('le verrou relâché par le navigateur page masquée est redemandé au retour au premier plan', async () => {
    const { wakeLock, phase, page } = setup();
    phase({ kind: 'connected' });
    await settle();
    wakeLock.held()[0]?.drop();
    page.set(false);
    await settle();
    expect(wakeLock.requests()).toBe(1);
    page.set(true);
    await settle();
    expect(wakeLock.held()).toHaveLength(1);
    expect(wakeLock.requests()).toBe(2);
  });

  test('un refus du navigateur ne relance pas la demande à chaque changement du magasin', async () => {
    const { wakeLock, phase, store } = setup({ refuse: true });
    phase({ kind: 'connected' });
    await settle();
    store.setState({ call: { ...call({ kind: 'connected' }), micMuted: true } });
    await settle();
    expect(wakeLock.requests()).toBe(1);
  });

  test('un appel terminé pendant la demande relâche aussitôt le verrou obtenu', async () => {
    const { wakeLock, phase } = setup();
    phase({ kind: 'connecting' });
    phase(null);
    await settle();
    expect(wakeLock.held()).toHaveLength(0);
  });

  test('détacher le pont relâche le verrou', async () => {
    const { wakeLock, phase, stop } = setup();
    phase({ kind: 'connected' });
    await settle();
    stop();
    expect(wakeLock.held()).toHaveLength(0);
  });

  test('sans API de verrou d’écran, rien ne se passe', () => {
    const store = createCallStore();
    const page = visibility();
    const stop = bindCallWakeLock({ wakeLock: undefined, store, visible: page.visible, onVisibilityChange: page.onVisibilityChange });
    store.setState({ call: call({ kind: 'connected' }) });
    expect(() => stop()).not.toThrow();
  });
});

describe('le pont d’appel branche le verrou d’écran', () => {
  test('call-socket-bridge démarre le verrou d’écran à la connexion', () => {
    const source = readFileSync(new URL('./call-socket-bridge.ts', import.meta.url), 'utf8');
    expect(source).toContain("import('./call-wake-lock')");
    expect(source).toContain('startCallWakeLock()');
  });
});
