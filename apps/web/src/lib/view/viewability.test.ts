import { describe, expect, test } from 'bun:test';

import {
  MRC_DISPLAY_MS,
  MRC_VIDEO_MS,
  createViewabilityClock,
  observeVisibility,
  trackVisibleTarget,
  visibleTargets,
} from './viewability';

/**
 * L'IMPRESSION VISIBLE AU SENS MRC (#10501) — ≥ 50 % de la surface pendant
 * 1 000 ms CONTINUES ; 2 000 ms pour une vidéo en lecture.
 */
describe('createViewabilityClock — la norme MRC', () => {
  test('à 999 ms, pas viewable ; à 1 000 ms, viewable', () => {
    const clock = createViewabilityClock('display');
    clock.update(0.6, 0);
    expect(clock.snapshot(999).viewable).toBe(false);
    expect(clock.snapshot(MRC_DISPLAY_MS).viewable).toBe(true);
  });

  test('une vidéo exige 2 000 ms', () => {
    const clock = createViewabilityClock('video');
    clock.update(1, 0);
    expect(clock.snapshot(1999).viewable).toBe(false);
    expect(clock.snapshot(MRC_VIDEO_MS).viewable).toBe(true);
  });

  test('repasser sous 50 % remet le chrono CONTINU à zéro', () => {
    const clock = createViewabilityClock('display');
    clock.update(0.8, 0);
    clock.update(0.3, 700);
    clock.update(0.8, 800);
    expect(clock.snapshot(1700).viewable).toBe(false);
    expect(clock.snapshot(1800).viewable).toBe(true);
  });

  test('viewable reste acquis ; visibleMs cumule le temps à ≥ 50 % ; la fraction maximale est arrondie à 2 décimales', () => {
    const clock = createViewabilityClock('display');
    clock.update(0.5, 0);
    clock.update(0.333333, 1200);
    clock.update(0.91234, 5000);
    const snap = clock.snapshot(5500);
    expect(snap.viewable).toBe(true);
    expect(snap.visibleMs).toBe(1700);
    expect(snap.maxVisibleFraction).toBe(0.91);
  });

  test('jamais visible : rien de compté', () => {
    const clock = createViewabilityClock('display');
    clock.update(0.2, 0);
    expect(clock.snapshot(10_000)).toEqual({ maxVisibleFraction: 0.2, visibleMs: 0, viewable: false });
  });
});

/** Un nœud opaque : le registre ne lit que son identité. */
const node = (): Element => ({}) as Element;

type Entry = { readonly target: Element; readonly isIntersecting: boolean; readonly intersectionRatio: number };

function fakeObserver() {
  const instances: { callback: (entries: readonly Entry[]) => void; observed: Set<Element>; thresholds: number[] }[] = [];
  const Observer = class {
    observed = new Set<Element>();
    constructor(callback: (entries: readonly Entry[]) => void, options: { threshold: number[] }) {
      instances.push({ callback, observed: this.observed, thresholds: options.threshold });
    }
    observe(node: Element) {
      this.observed.add(node);
    }
    unobserve(node: Element) {
      this.observed.delete(node);
    }
    disconnect() {
      this.observed.clear();
    }
  };
  return { Observer, instances };
}

describe('observeVisibility — UN seul IntersectionObserver partagé', () => {
  test('deux nœuds observés partagent un observateur aux seuils [0, 0.5, 1]', () => {
    const { Observer, instances } = fakeObserver();
    const a = node();
    const b = node();
    const seen: string[] = [];
    observeVisibility(a, (f) => seen.push(`a${f}`), { Observer });
    observeVisibility(b, (f) => seen.push(`b${f}`), { Observer });
    expect(instances).toHaveLength(1);
    expect(instances[0]?.thresholds).toEqual([0, 0.5, 1]);
    instances[0]?.callback([{ target: b, isIntersecting: true, intersectionRatio: 0.5 }]);
    expect(seen).toEqual(['b0.5']);
  });

  test('arrêter l’observation d’un nœud ne coupe pas l’autre', () => {
    const { Observer, instances } = fakeObserver();
    const a = node();
    const b = node();
    const seen: string[] = [];
    const stopA = observeVisibility(a, (f) => seen.push(`a${f}`), { Observer });
    observeVisibility(b, (f) => seen.push(`b${f}`), { Observer });
    stopA();
    instances[0]?.callback([
      { target: a, isIntersecting: true, intersectionRatio: 1 },
      { target: b, isIntersecting: true, intersectionRatio: 1 },
    ]);
    expect(seen).toEqual(['b1']);
  });
});

describe('visibleTargets — ce qui est à l’écran, pour une capture', () => {
  test('les cibles visibles, de la plus visible à la moins visible, dix au plus', () => {
    const { Observer, instances } = fakeObserver();
    const nodes = Array.from({ length: 12 }, () => node());
    const stops = nodes.map((node, i) => trackVisibleTarget(node, { kind: 'post', id: `p${i}` }, { Observer }));
    instances[0]?.callback(nodes.map((target, i) => ({ target, isIntersecting: i > 0, intersectionRatio: i > 0 ? i / 12 : 0 })));
    const visible = visibleTargets();
    expect(visible).toHaveLength(10);
    expect(visible[0]).toEqual({ kind: 'post', id: 'p11', visibleFraction: 0.92 });
    expect(visible.some((t) => t.id === 'p0')).toBe(false);
    stops.forEach((stop) => stop());
    expect(visibleTargets()).toEqual([]);
  });
});
