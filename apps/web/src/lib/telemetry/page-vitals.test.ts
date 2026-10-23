import { describe, expect, test } from 'bun:test';

import { createVitalsAccumulator, observePageVitals, playbackPageProbe, type VitalsObserverHost } from './page-vitals';

/**
 * W11 (#11317) — LES WEB VITALS ET LES LONGUES IMAGES DE LA PAGE. Aucun
 * PerformanceObserver ne tournait en production : un rebuffer se mesurait,
 * une image perdue pendant la lecture non. L'accumulateur est PUR (il reçoit
 * des entrées déjà lues) ; seul `observePageVitals` touche au navigateur.
 */
describe('createVitalsAccumulator — LCP, CLS, INP', () => {
  test('rien observé : aucun champ, jamais un zéro inventé', () => {
    expect(createVitalsAccumulator().vitals()).toEqual({});
  });

  test('LCP : la DERNIÈRE plus grande peinture fait foi', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'lcp', startTime: 800.4 });
    acc.record({ kind: 'lcp', startTime: 1_900.6 });
    expect(acc.vitals().lcpMs).toBe(1_901);
  });

  test('CLS : la pire fenêtre de session, les décalages après une saisie exclus', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'shift', startTime: 0, value: 0.05, hadRecentInput: false });
    acc.record({ kind: 'shift', startTime: 500, value: 0.05, hadRecentInput: false });
    acc.record({ kind: 'shift', startTime: 3_000, value: 0.2, hadRecentInput: true });
    acc.record({ kind: 'shift', startTime: 4_000, value: 0.04, hadRecentInput: false });
    expect(acc.vitals().cls).toBe(0.1);
  });

  test('CLS : une fenêtre se ferme après 1 s de calme OU 5 s de durée', () => {
    const acc = createVitalsAccumulator();
    [0, 900, 1_800, 2_700, 3_600, 4_500, 5_400].forEach((startTime) => acc.record({ kind: 'shift', startTime, value: 0.03, hadRecentInput: false }));
    expect(acc.vitals().cls).toBe(0.18);
  });

  test('INP : la pire interaction tant qu’il y en a moins de 50, chaque interaction comptée une fois', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'interaction', interactionId: 1, duration: 80 });
    acc.record({ kind: 'interaction', interactionId: 1, duration: 140 });
    acc.record({ kind: 'interaction', interactionId: 2, duration: 96 });
    acc.record({ kind: 'interaction', interactionId: 0, duration: 900 });
    expect(acc.vitals().inpMs).toBe(140);
  });

  test('INP : une valeur aberrante sur 50 interactions est écartée (98e centile)', () => {
    const acc = createVitalsAccumulator();
    Array.from({ length: 60 }, (_, index) => index + 1).forEach((interactionId) => acc.record({ kind: 'interaction', interactionId, duration: interactionId === 7 ? 2_000 : 40 + interactionId }));
    expect(acc.vitals().inpMs).toBe(100);
  });
});

describe('createVitalsAccumulator — les longues images (LoAF)', () => {
  test('cumul croissant : nombre, temps bloquant, pire durée', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'frame', duration: 72.4, blockingDuration: 22.4 });
    acc.record({ kind: 'frame', duration: 180, blockingDuration: 130 });
    expect(acc.frames()).toEqual({ count: 2, blockingMs: 152.4, worstMs: 180 });
  });

  test('les longues images d’une SÉANCE : seulement celles survenues depuis son ouverture', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'frame', duration: 400, blockingDuration: 350 });
    const since = acc.frames();
    acc.record({ kind: 'frame', duration: 90, blockingDuration: 40 });
    acc.record({ kind: 'frame', duration: 60, blockingDuration: 10.6 });
    expect(acc.framesSince(since)).toEqual({ longFrames: 2, longFramesBlockingMs: 51, longFrameWorstMs: 90 });
  });

  test('aucune longue image pendant la séance : zéro, pas la pire de la page', () => {
    const acc = createVitalsAccumulator();
    acc.record({ kind: 'frame', duration: 400, blockingDuration: 350 });
    expect(acc.framesSince(acc.frames())).toEqual({ longFrames: 0, longFramesBlockingMs: 0, longFrameWorstMs: 0 });
  });
});

type Registration = { readonly type: string; readonly buffered: boolean; readonly deliver: (entries: readonly Record<string, unknown>[]) => void };

const fakeHost = (supported: readonly string[]) => {
  const registrations: Registration[] = [];
  class FakeObserver {
    static readonly supportedEntryTypes = supported;
    constructor(private readonly callback: (list: { getEntries(): readonly Record<string, unknown>[] }) => void) {}
    observe(options: { type: string; buffered?: boolean }): void {
      registrations.push({ type: options.type, buffered: options.buffered === true, deliver: (entries) => this.callback({ getEntries: () => entries }) });
    }
  }
  const host: VitalsObserverHost = { PerformanceObserver: FakeObserver as unknown as VitalsObserverHost['PerformanceObserver'] };
  return { host, registrations };
};

describe('observePageVitals — le seul site qui touche au navigateur', () => {
  test('sans PerformanceObserver (vieux WebView) : rien n’est observé, rien ne casse', () => {
    const acc = observePageVitals({});
    expect(acc.vitals()).toEqual({});
    expect(acc.frames()).toEqual({ count: 0, blockingMs: 0, worstMs: 0 });
  });

  test('n’observe que les types que le moteur annonce, avec l’historique tamponné', () => {
    const { host, registrations } = fakeHost(['largest-contentful-paint', 'layout-shift']);
    observePageVitals(host);
    expect(registrations.map((r) => [r.type, r.buffered])).toEqual([
      ['largest-contentful-paint', true],
      ['layout-shift', true],
    ]);
  });

  test('chaque entrée du moteur nourrit l’accumulateur', () => {
    const { host, registrations } = fakeHost(['largest-contentful-paint', 'layout-shift', 'event', 'long-animation-frame']);
    const acc = observePageVitals(host);
    const deliver = (type: string, entries: readonly Record<string, unknown>[]) => registrations.find((r) => r.type === type)?.deliver(entries);
    deliver('largest-contentful-paint', [{ startTime: 1_200 }]);
    deliver('layout-shift', [{ startTime: 10, value: 0.02, hadRecentInput: false }]);
    deliver('event', [{ interactionId: 4, duration: 120 }, { interactionId: 0, duration: 999 }]);
    deliver('long-animation-frame', [{ duration: 90, blockingDuration: 40 }]);
    expect(acc.vitals()).toEqual({ lcpMs: 1_200, cls: 0.02, inpMs: 120 });
    expect(acc.frames()).toEqual({ count: 1, blockingMs: 40, worstMs: 90 });
  });

  test('l’observation des interactions ne retient que les gestes lents (seuil 40 ms)', () => {
    const observed: { type: string; durationThreshold?: number }[] = [];
    class Spy {
      static readonly supportedEntryTypes = ['event'];
      observe(options: { type: string; durationThreshold?: number }): void {
        observed.push(options);
      }
    }
    observePageVitals({ PerformanceObserver: Spy as unknown as VitalsObserverHost['PerformanceObserver'] });
    expect(observed).toEqual([{ type: 'event', buffered: true, durationThreshold: 40 }]);
  });

  test('un moteur qui refuse un type (exception) n’empêche pas les autres', () => {
    const observed: string[] = [];
    class Picky {
      static readonly supportedEntryTypes = ['largest-contentful-paint', 'long-animation-frame'];
      observe(options: { type: string }): void {
        if (options.type === 'largest-contentful-paint') throw new TypeError('refusé');
        observed.push(options.type);
      }
    }
    observePageVitals({ PerformanceObserver: Picky as unknown as VitalsObserverHost['PerformanceObserver'] });
    expect(observed).toEqual(['long-animation-frame']);
  });
});

describe('playbackPageProbe — ce qu’une séance de lecture emporte de la page', () => {
  test('tier lu à l’ouverture, Web Vitals à la fermeture, longues images de la SEULE séance', () => {
    const vitals = createVitalsAccumulator();
    vitals.record({ kind: 'frame', duration: 500, blockingDuration: 450 });
    const tiers = ['mid', 'high'] as const;
    let reads = 0;
    const probe = playbackPageProbe({ vitals, tier: () => tiers[reads++] ?? 'high' });
    const session = probe.open();
    vitals.record({ kind: 'lcp', startTime: 2_100 });
    vitals.record({ kind: 'frame', duration: 70, blockingDuration: 20 });
    expect(session.close()).toEqual({ deviceTier: 'mid', lcpMs: 2_100, longFrames: 1, longFramesBlockingMs: 20, longFrameWorstMs: 70 });
    expect(reads).toBe(1);
  });
});
