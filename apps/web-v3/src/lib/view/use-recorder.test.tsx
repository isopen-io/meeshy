import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

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
  GlobalRegistrator.register();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
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
