import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { PendingAttachment } from '@/lib/send/attachments';

import type { RecorderEngine, RecorderEngineResult, RecorderState } from './use-recorder';
import { MIN_SENDABLE_DURATION_MS, useRecorder } from './use-recorder';

/**
 * TÉMOIN (#5668) — patron `use-live-announcer.test.tsx` (happy-dom +
 * `createRoot` + `act`). Le moteur (`RecorderEngine`) est BOUCHONNÉ : aucun
 * témoin n'appelle `getUserMedia`/`MediaRecorder` réels. L'horloge (`now`) et
 * l'intervalle (`interval`) sont INJECTÉS — un test contrôle le temps en
 * appelant lui-même le callback capturé, jamais un `setTimeout` réel.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  // Défaut 2 (revue #5668) — DRAINER le planificateur React AVANT de
  // désenregistrer `window` : `bun test` enchaîne les fichiers dans le même
  // process, et une tâche `performWorkOnRootViaSchedulerTask` posée par le
  // DERNIER `act()` de ce fichier peut survivre au-delà du dernier `await`
  // synchrone visible ici. Sans ce drain, `releaseHappyDomIfRegistered()`
  // efface `window` PENDANT que cette tâche s'exécute encore, et elle lève
  // `TypeError: undefined is not an object (evaluating 'window.event')` —
  // observé de façon INTERMITTENTE (5/5, 20/20 machine au repos) sous
  // charge, jamais un défaut du fichier qui l'exécute (10/10 seul). Ce
  // fichier suit le même patron que les onze autres (un enregistrement
  // par fichier, via `happy-dom-environment.ts` depuis #5888) ; eux restent HORS de ce lot — issue compagnon dédiée pour
  // le préchargement UNIQUE (`bunfig.toml [test] preload`).
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Recorder = ReturnType<typeof useRecorder>;

function fakeEngine(
  requestResult: RecorderEngineResult,
): RecorderEngine & { readonly stopCalls: number; readonly onLevelRef: { current: ((level: number) => void) | null } } {
  const onLevelRef: { current: ((level: number) => void) | null } = { current: null };
  let stopCalls = 0;
  return {
    onLevelRef,
    get stopCalls() {
      return stopCalls;
    },
    async requestStream() {
      return requestResult;
    },
    start(_stream, onLevel) {
      onLevelRef.current = onLevel;
    },
    async stop() {
      stopCalls += 1;
      return { blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: 'audio/webm;codecs=opus' };
    },
    release() {
      /* rien à faire sur un `MediaStream` bouchonné */
    },
  };
}

function fakeStream(): MediaStream {
  return {} as MediaStream;
}

/** Un `interval` INJECTABLE qui capture le dernier callback posé — un test
 * le rejoue lui-même par `tick.current()`, aucun délai réel. */
function capturingInterval(): { readonly schedule: (cb: () => void, ms: number) => () => void; tick: () => void } {
  let callback: (() => void) | null = null;
  return {
    schedule: (cb) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
    tick: () => callback?.(),
  };
}

function Harness({ onReady, engine, now, interval }: {
  readonly onReady: (recorder: Recorder) => void;
  readonly engine: RecorderEngine;
  readonly now: () => number;
  readonly interval: (cb: () => void, ms: number) => () => void;
}) {
  const recorder = useRecorder({ engine, now, interval });
  onReady(recorder);
  return (
    <div
      data-status={recorder.state.status}
      data-duration={recorder.state.durationMs}
      data-levels={recorder.state.levels.length}
    />
  );
}

function mount(params: {
  readonly onReady: (recorder: Recorder) => void;
  readonly engine: RecorderEngine;
  readonly now?: () => number;
  readonly interval?: (cb: () => void, ms: number) => () => void;
}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const now = params.now ?? (() => 0);
  const interval = params.interval ?? (() => () => {});
  act(() => {
    root.render(<Harness onReady={params.onReady} engine={params.engine} now={now} interval={interval} />);
  });
  return container;
}

const stateOf = (el: HTMLDivElement): RecorderState => ({
  status: el.querySelector('div')!.getAttribute('data-status') as RecorderState['status'],
  durationMs: Number(el.querySelector('div')!.getAttribute('data-duration')),
  levels: Array.from({ length: Number(el.querySelector('div')!.getAttribute('data-levels')) }),
});

describe('useRecorder — permission (#5668)', () => {
  test('start() : idle → requesting → recording quand le moteur accorde le flux', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    const el = mount({ onReady: (r) => (recorder = r), engine });
    expect(stateOf(el).status).toBe('idle');

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stateOf(el).status).toBe('recording');
  });

  test('refus de permission ⇒ status "refused"', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: false, reason: 'refused' });
    const el = mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stateOf(el).status).toBe('refused');
  });

  test('environnement non supporté ⇒ status "unsupported"', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: false, reason: 'unsupported' });
    const el = mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stateOf(el).status).toBe('unsupported');
  });

  test('« Réessayer » depuis refused relance simplement start()', async () => {
    let recorder!: Recorder;
    let calls = 0;
    const engine: RecorderEngine = {
      requestStream: async () => {
        calls += 1;
        return calls === 1 ? { ok: false, reason: 'refused' } : { ok: true, stream: fakeStream() };
      },
      start: () => {},
      stop: async () => ({ blob: new Blob([]), mimeType: 'audio/webm' }),
      release: () => {},
    };
    const el = mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(stateOf(el).status).toBe('refused');

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(stateOf(el).status).toBe('recording');
    expect(calls).toBe(2);
  });
});

describe('useRecorder — durée et niveaux (#5668)', () => {
  test('le tick de l’intervalle met à jour durationMs depuis `now`', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    const clock = capturingInterval();
    let elapsed = 0;
    const el = mount({ onReady: (r) => (recorder = r), engine, now: () => elapsed, interval: clock.schedule });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(stateOf(el).durationMs).toBe(0);

    elapsed = 1200;
    act(() => clock.tick());
    expect(stateOf(el).durationMs).toBe(1200);
  });

  test('les niveaux s’accumulent, plafonnés à 15 (miroir des 15 valeurs iOS)', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() }) as ReturnType<typeof fakeEngine>;
    const el = mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      for (let i = 0; i < 20; i += 1) engine.onLevelRef.current?.(0.5);
    });

    expect(stateOf(el).levels).toHaveLength(15);
  });
});

describe('useRecorder — stop()/cancel() et le seuil de 0,5 s (#5668)', () => {
  test('stop() SOUS le seuil ⇒ null (« arrêter » ANNULE), status redevient idle', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    let elapsed = 0;
    const el = mount({ onReady: (r) => (recorder = r), engine, now: () => elapsed });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    elapsed = MIN_SENDABLE_DURATION_MS - 1;

    const box: { result: PendingAttachment | null } = { result: null };
    await act(async () => {
      box.result = await recorder.stop();
    });

    expect(box.result).toBeNull();
    expect(stateOf(el).status).toBe('idle');
  });

  test('stop() AU-DESSUS du seuil ⇒ un PendingAttachment audio avec durationMs', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    let elapsed = 0;
    const el = mount({ onReady: (r) => (recorder = r), engine, now: () => elapsed });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    elapsed = 2000;

    const box: { result: PendingAttachment | null } = { result: null };
    await act(async () => {
      box.result = await recorder.stop();
    });

    expect(box.result?.kind).toBe('audio');
    expect(box.result?.durationMs).toBe(2000);
    expect(stateOf(el).status).toBe('idle');
  });

  test('cancel() pendant l’enregistrement appelle engine.stop() (relâche la piste) et redevient idle', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() }) as ReturnType<typeof fakeEngine>;
    const el = mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => recorder.cancel());

    expect(engine.stopCalls).toBe(1);
    expect(stateOf(el).status).toBe('idle');
  });

  test('cancel() hors enregistrement (idle/requesting) ⇒ redevient idle sans appeler engine.stop()', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() }) as ReturnType<typeof fakeEngine>;
    mount({ onReady: (r) => (recorder = r), engine });

    act(() => recorder.cancel());

    expect(engine.stopCalls).toBe(0);
  });
});

/**
 * DÉFAUT 6 (revue #5668) — un DOUBLE TAP pendant `requesting` (la fenêtre
 * où le bouton est encore rendu, seulement `aria-busy`) ne doit JAMAIS
 * lancer une seconde `requestStream()` : sans garde, la seconde captation
 * écrasait `streamRef.current` sans relâcher la première — un témoin
 * système de captation restait allumé après « Annuler ».
 */
describe('useRecorder — double tap pendant `requesting` (défaut 6, revue #5668)', () => {
  test('deux start() consécutifs pendant `requesting` ⇒ UNE SEULE requestStream(), UNE SEULE piste ouverte', async () => {
    let recorder!: Recorder;
    let requestCalls = 0;
    let releaseCalls = 0;
    let resolveRequest!: (result: RecorderEngineResult) => void;
    const stream = fakeStream();
    const engine: RecorderEngine = {
      requestStream: () =>
        new Promise<RecorderEngineResult>((resolve) => {
          requestCalls += 1;
          resolveRequest = resolve;
        }),
      start: () => {},
      stop: async () => ({ blob: new Blob([]), mimeType: 'audio/webm' }),
      release: () => {
        releaseCalls += 1;
      },
    };
    mount({ onReady: (r) => (recorder = r), engine });

    // Deux taps synchrones, comme un double tap réel — le second survient
    // AVANT que `requestStream()` n'ait résolu.
    act(() => {
      recorder.start();
      recorder.start();
    });
    expect(requestCalls).toBe(1);

    await act(async () => {
      resolveRequest({ ok: true, stream });
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => recorder.cancel());
    expect(releaseCalls).toBe(1); // autant de relâchements que de flux rendus.
  });

  test('start() rappelé pendant `recording` (déjà actif) ⇒ ignoré, aucune seconde demande', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    let calls = 0;
    const countingEngine: RecorderEngine = {
      ...engine,
      requestStream: async () => {
        calls += 1;
        return engine.requestStream();
      },
    };
    mount({ onReady: (r) => (recorder = r), engine: countingEngine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toBe(1);

    act(() => {
      recorder.start(); // déjà `recording` — doit être un no-op.
    });
    expect(calls).toBe(1);
  });
});

/**
 * #12874 — dans la coque Android, `requesting` couvre la demande de
 * permission native : on peut annuler ou quitter le fil avant que le flux
 * n'arrive. Une demande abandonnée relâche le flux reçu en retard et ne
 * démarre ni l'enregistrement ni le service de la coque.
 */
describe('useRecorder — demande de micro abandonnée pendant `requesting` (#12874)', () => {
  function lateEngine() {
    const calls = { start: 0, release: 0, hold: 0 };
    let resolveRequest!: (result: RecorderEngineResult) => void;
    const engine: RecorderEngine = {
      requestStream: () =>
        new Promise<RecorderEngineResult>((resolve) => {
          resolveRequest = resolve;
        }),
      start: () => {
        calls.start += 1;
      },
      stop: async () => ({ blob: new Blob([]), mimeType: 'audio/webm' }),
      release: () => {
        calls.release += 1;
      },
    };
    const microphone = {
      hold: () => {
        calls.hold += 1;
      },
      release: () => {},
    };
    return { engine, microphone, calls, deliver: (result: RecorderEngineResult) => resolveRequest(result) };
  }

  function HeldHarness({ onReady, late }: { readonly onReady: (r: Recorder) => void; readonly late: ReturnType<typeof lateEngine> }) {
    const recorder = useRecorder({ engine: late.engine, microphone: late.microphone, now: () => 0, interval: () => () => {} });
    onReady(recorder);
    return <div data-status={recorder.state.status} data-duration={0} data-levels={0} />;
  }

  function mountHeld(late: ReturnType<typeof lateEngine>, onReady: (r: Recorder) => void): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<HeldHarness onReady={onReady} late={late} />);
    });
    return container;
  }

  test('annuler pendant `requesting` puis recevoir le flux ⇒ flux relâché, rien ne démarre', async () => {
    let recorder!: Recorder;
    const late = lateEngine();
    const el = mountHeld(late, (r) => (recorder = r));

    act(() => recorder.start());
    act(() => recorder.cancel());
    await act(async () => {
      late.deliver({ ok: true, stream: fakeStream() });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(late.calls).toEqual({ start: 0, release: 1, hold: 0 });
    expect(stateOf(el).status).toBe('idle');
  });

  test('quitter le fil pendant `requesting` puis recevoir le flux ⇒ flux relâché, ni enregistrement ni service', async () => {
    let recorder!: Recorder;
    const late = lateEngine();
    mountHeld(late, (r) => (recorder = r));

    act(() => recorder.start());
    act(() => root.render(<div />));
    await act(async () => {
      late.deliver({ ok: true, stream: fakeStream() });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(late.calls).toEqual({ start: 0, release: 1, hold: 0 });
  });
});

/**
 * #12908 — `engine.stop()` est le seul à fermer l'`AudioContext` et la boucle
 * du vumètre. Quitter le fil pendant un enregistrement doit l'appeler, comme
 * l'annulation : sinon les deux survivent jusqu'au rechargement, ce qui dans
 * la coque Android peut prendre des jours.
 */
describe('useRecorder — quitter le fil pendant un enregistrement (#12908)', () => {
  test('démonter pendant `recording` arrête le moteur (contexte audio et vumètre compris)', async () => {
    let recorder!: Recorder;
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    mount({ onReady: (r) => (recorder = r), engine });

    await act(async () => {
      recorder.start();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => root.render(<div />));

    expect(engine.stopCalls).toBe(1);
  });

  test('démonter au repos ne touche pas au moteur', () => {
    const engine = fakeEngine({ ok: true, stream: fakeStream() });
    mount({ onReady: () => {}, engine });

    act(() => root.render(<div />));

    expect(engine.stopCalls).toBe(0);
  });
});
