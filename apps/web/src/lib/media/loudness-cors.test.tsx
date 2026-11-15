import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createCorsLedger, createLoudnessApplier, useLoudnessLevel, type CorsLedger, type LoudnessGraph } from './loudness-level';

/**
 * #12285 (web), tour 5 — SÛR PAR DÉFAUT. Un `<audio>` branché sur un
 * `MediaElementAudioSourceNode` dont la réponse n'est pas lisible en CORS sort
 * du SILENCE. Le gain n'emprunte donc Web Audio qu'après DEUX preuves : la
 * réponse de la passerelle porte l'en-tête CORS (sonde `HEAD` en mode `cors`,
 * une fois par origine), puis l'élément, chargé en `crossOrigin="anonymous"`,
 * a effectivement lu ses métadonnées. Sans l'une ou l'autre : lecture directe,
 * volume d'origine, jamais muette.
 */
const SRC = 'https://gate.test/api/v1/attachments/file/2026%2F10%2Fu%2Fvoice.m4a';

describe('createCorsLedger — la preuve CORS, une fois par origine', () => {
  test('une sonde qui lève (en-tête absent) ⇒ refusée ; qui répond ⇒ lisible', async () => {
    const refusing = createCorsLedger(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(refusing.verdict(SRC)).toBe('unknown');
    expect(await refusing.probe(SRC)).toBe('refused');
    expect(refusing.verdict(SRC)).toBe('refused');

    const readable = createCorsLedger(async () => true);
    expect(await readable.probe(SRC)).toBe('readable');
  });

  test('une seule sonde par origine, quel que soit le nombre de vocaux', async () => {
    const calls: string[] = [];
    const ledger = createCorsLedger(async (src) => {
      calls.push(src);
      return true;
    });
    await Promise.all([ledger.probe(SRC), ledger.probe(`${SRC}?x=1`), ledger.probe('https://gate.test/api/v1/attachments/file/autre.m4a')]);
    expect(calls).toHaveLength(1);
  });

  test('un échec de chargement en CORS retire la preuve pour l’origine', async () => {
    const ledger = createCorsLedger(async () => true);
    await ledger.probe(SRC);
    ledger.refuse(SRC);
    expect(ledger.verdict(SRC)).toBe('refused');
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function recordingGraph(): { readonly routes: string[]; readonly graph: LoudnessGraph } {
  const routes: string[] = [];
  return {
    routes,
    graph: {
      route: (_element, gain) => {
        routes.push(gain.toFixed(2));
        return { setGain: () => undefined, resume: () => undefined, release: () => undefined };
      },
    },
  };
}

function Host({ ledger, graph }: { readonly ledger: CorsLedger; readonly graph: LoudnessGraph }) {
  const [applier] = useState(() => createLoudnessApplier(graph));
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const bind = useCallback((next: HTMLAudioElement | null) => setElement(next), []);
  const loudness = useLoudnessLevel({ element, lufs: -24, playsOriginal: true, src: SRC, applier, ledger });
  return <audio key={`${SRC}${loudness.remountKey}`} ref={bind} preload="none" {...loudness.attributes} src={SRC} />;
}

async function mount(ledger: CorsLedger, graph: LoudnessGraph): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Host ledger={ledger} graph={graph} />));
  await act(async () => {});
  return container;
}

const fire = async (el: HTMLDivElement, type: string): Promise<void> => {
  await act(async () => {
    el.querySelector('audio')!.dispatchEvent(new Event(type));
  });
};

describe('useLoudnessLevel — une source sans CORS joue quand même, sans amplification', () => {
  test('sonde refusée : aucun crossOrigin, aucun graphe, volume d’origine', async () => {
    const { routes, graph } = recordingGraph();
    const el = await mount(createCorsLedger(async () => {
      throw new TypeError('Failed to fetch');
    }), graph);
    await fire(el, 'loadstart');
    await fire(el, 'loadedmetadata');
    const audio = el.querySelector('audio')!;
    expect(audio.hasAttribute('crossorigin')).toBe(false);
    expect(audio.volume).toBe(1);
    expect(routes).toEqual([]);
  });

  test('sonde lisible : crossOrigin posé, et le graphe n’est branché qu’après les métadonnées', async () => {
    const { routes, graph } = recordingGraph();
    const el = await mount(createCorsLedger(async () => true), graph);
    expect(el.querySelector('audio')!.getAttribute('crossorigin')).toBe('anonymous');
    await fire(el, 'loadstart');
    expect(routes).toEqual([]);
    await fire(el, 'loadedmetadata');
    expect(routes).toEqual([dbGain(8)]);
  });

  test('l’élément en CORS échoue au chargement : il est remonté SANS crossOrigin, jamais branché', async () => {
    const { routes, graph } = recordingGraph();
    const el = await mount(createCorsLedger(async () => true), graph);
    const first = el.querySelector('audio')!;
    await fire(el, 'loadstart');
    await fire(el, 'error');
    const second = el.querySelector('audio')!;
    expect(second).not.toBe(first);
    expect(second.hasAttribute('crossorigin')).toBe(false);
    await fire(el, 'loadstart');
    await fire(el, 'loadedmetadata');
    expect(routes).toEqual([]);
  });

  test('chargement parti AVANT la preuve : l’élément garde son mode, sans gain', async () => {
    const { routes, graph } = recordingGraph();
    const pending: { resolve?: (ok: boolean) => void } = {};
    const el = await mount(createCorsLedger(() => new Promise<boolean>((resolve) => (pending.resolve = resolve))), graph);
    await fire(el, 'loadstart');
    await act(async () => pending.resolve?.(true));
    await act(async () => {});
    expect(el.querySelector('audio')!.hasAttribute('crossorigin')).toBe(false);
    await fire(el, 'loadedmetadata');
    expect(routes).toEqual([]);
  });
});

const dbGain = (db: number): string => (10 ** (db / 20)).toFixed(2);
