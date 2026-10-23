import { describe, expect, test } from 'bun:test';

import { createLoudnessApplier, type LoudnessGraph } from './loudness-level';

/**
 * #12285 (web) — L'APPLICATION DU PLAN SUR UN ÉLÉMENT. Le graphe Web Audio est
 * injecté : `bun test` n'en a pas, et la loi à prouver est celle du routage
 * (une fois par élément, gain mis à jour, libéré au démontage, contexte repris
 * au `play`), jamais le moteur audio du navigateur.
 */
type FakeElement = HTMLMediaElement & { readonly fire: (type: string) => void };

const fakeElement = (): FakeElement => {
  const listeners = new Map<string, Set<() => void>>();
  const element = {
    volume: 1,
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, new Set([...(listeners.get(type) ?? []), listener]));
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
    fire: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
  };
  return element as unknown as FakeElement;
};

const recordingGraph = () => {
  const log: string[] = [];
  const graph: LoudnessGraph = {
    route: (_element, gain) => {
      log.push(`route ${gain.toFixed(2)}`);
      return {
        setGain: (next) => log.push(`gain ${next.toFixed(2)}`),
        resume: () => log.push('resume'),
        release: () => log.push('release'),
      };
    },
  };
  return { log, graph };
};

describe('createLoudnessApplier — atténuer, amplifier, libérer', () => {
  test('atténuer passe par le volume de l’élément, sans graphe ; « aucun » le rend à 1', () => {
    const { log, graph } = recordingGraph();
    const applier = createLoudnessApplier(graph);
    const element = fakeElement();
    applier.apply(element, { kind: 'attenuate', volume: 0.5 });
    expect(element.volume).toBe(0.5);
    applier.apply(element, { kind: 'none' });
    expect(element.volume).toBe(1);
    expect(log).toEqual([]);
  });

  test('amplifier route l’élément UNE fois, puis ne fait que changer le gain', () => {
    const { log, graph } = recordingGraph();
    const applier = createLoudnessApplier(graph);
    const element = fakeElement();
    applier.apply(element, { kind: 'boost', gain: 2.5 });
    applier.apply(element, { kind: 'boost', gain: 3 });
    applier.apply(element, { kind: 'none' });
    applier.apply(element, { kind: 'attenuate', volume: 0.5 });
    expect(log).toEqual(['route 2.50', 'gain 3.00', 'gain 1.00', 'gain 0.50']);
    expect(element.volume).toBe(1);
  });

  test('le contexte audio est repris à chaque lecture d’un élément routé', () => {
    const { log, graph } = recordingGraph();
    const applier = createLoudnessApplier(graph);
    const element = fakeElement();
    applier.apply(element, { kind: 'boost', gain: 2 });
    element.fire('play');
    expect(log).toEqual(['route 2.00', 'resume']);
  });

  test('libérer défait le graphe et retire l’écoute ; un second apply re-route', () => {
    const { log, graph } = recordingGraph();
    const applier = createLoudnessApplier(graph);
    const element = fakeElement();
    applier.apply(element, { kind: 'boost', gain: 2 });
    applier.release(element);
    element.fire('play');
    expect(log).toEqual(['route 2.00', 'release']);
  });

  test('un graphe indisponible (aucun AudioContext) : rien, le son reste celui d’avant', () => {
    const applier = createLoudnessApplier({ route: () => null });
    const element = fakeElement();
    applier.apply(element, { kind: 'boost', gain: 2 });
    expect(element.volume).toBe(1);
  });
});
