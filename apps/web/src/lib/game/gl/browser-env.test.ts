import { describe, expect, test } from 'bun:test';

import { createBrowserEnv, requestTiltPermission, type BrowserWin } from './browser-env';
import type { GlCanvas } from './engine';

type Orientation = { readonly beta: number | null; readonly gamma: number | null };
type Listener = (event: Orientation) => void;

const fakeWin = (o: { readonly sensor?: boolean; readonly intersection?: boolean; readonly reduced?: boolean } = {}) => {
  const listeners = new Map<string, Listener[]>();
  const observed: { callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void; disconnected: boolean }[] = [];
  const log = { raf: 0, caf: 0 };
  const win: BrowserWin = {
    requestAnimationFrame: () => (log.raf += 1),
    cancelAnimationFrame: () => void (log.caf += 1),
    addEventListener: (type, listener) => void listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    removeEventListener: (type, listener) => void listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== listener)),
    matchMedia: () => ({ matches: o.reduced ?? false }),
    devicePixelRatio: 3,
    ...(o.sensor === false ? {} : { DeviceOrientationEvent: class {} }),
    ...(o.intersection === false
      ? {}
      : {
          IntersectionObserver: class {
            private readonly record: { callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void; disconnected: boolean };
            constructor(callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void) {
              this.record = { callback, disconnected: false };
              observed.push(this.record);
            }
            observe(): void {}
            disconnect(): void {
              this.record.disconnected = true;
            }
          },
        }),
  };
  return { win, listeners, observed, log, fire: (type: string, event: Orientation) => (listeners.get(type) ?? []).forEach((l) => l(event)) };
};

const host = { clientWidth: 100, clientHeight: 80 };
const canvasOf = (): GlCanvas => ({ width: 0, height: 0, getContext: () => null });

describe('createBrowserEnv', () => {
  test('la réduction des animations vient de la requête média', () => {
    expect(createBrowserEnv({ win: fakeWin({ reduced: true }).win, host, canvas: canvasOf() }).reducedMotion).toBe(true);
    expect(createBrowserEnv({ win: fakeWin().win, host, canvas: canvasOf() }).reducedMotion).toBe(false);
  });

  test('sans contexte WebGL2 : createGl rend null', () => {
    expect(createBrowserEnv({ win: fakeWin().win, host, canvas: canvasOf() }).createGl()).toBeNull();
  });

  test('la visibilité vient d’un IntersectionObserver, et le désabonnement le déconnecte', () => {
    const w = fakeWin();
    const seen: boolean[] = [];
    const stop = createBrowserEnv({ win: w.win, host, canvas: canvasOf() }).observeVisibility((v) => seen.push(v));
    w.observed[0]?.callback([{ isIntersecting: false }]);
    w.observed[0]?.callback([{ isIntersecting: true }]);
    expect(seen).toEqual([false, true]);
    stop();
    expect(w.observed[0]?.disconnected).toBe(true);
  });

  test('sans IntersectionObserver : l’hôte est supposé visible, rien à désabonner', () => {
    const w = fakeWin({ intersection: false });
    const stop = createBrowserEnv({ win: w.win, host, canvas: canvasOf() }).observeVisibility(() => undefined);
    expect(() => stop()).not.toThrow();
  });

  test('l’inclinaison vient de deviceorientation, normalisée dans [-1, 1]', () => {
    const w = fakeWin();
    const tilts: (readonly [number, number])[] = [];
    const stop = createBrowserEnv({ win: w.win, host, canvas: canvasOf() }).observeOrientation((t) => tilts.push(t));
    w.fire('deviceorientation', { beta: 45, gamma: 22.5 });
    expect(tilts).toEqual([[0.5, 0]]);
    stop?.();
    expect(w.listeners.get('deviceorientation')).toEqual([]);
  });

  test('sans capteur d’orientation : null, pour que le moteur dérive tout seul', () => {
    expect(createBrowserEnv({ win: fakeWin({ sensor: false }).win, host, canvas: canvasOf() }).observeOrientation(() => undefined)).toBeNull();
  });

  test('requestAnimationFrame et son annulation sont ceux de la fenêtre', () => {
    const w = fakeWin();
    const env = createBrowserEnv({ win: w.win, host, canvas: canvasOf() });
    const id = env.raf(() => undefined);
    env.cancelRaf(id);
    expect(w.log).toEqual({ raf: 1, caf: 1 });
  });
});

describe('requestTiltPermission — iOS demande l’autorisation depuis un geste', () => {
  const withPermission = (answer: () => Promise<string>) => ({ DeviceOrientationEvent: Object.assign(class {}, { requestPermission: answer }) });

  test('sans API de permission (Android, bureau) : accordée d’office', async () => {
    expect(await requestTiltPermission({})).toBe(true);
    expect(await requestTiltPermission({ DeviceOrientationEvent: class {} })).toBe(true);
  });

  test('iOS : elle suit la réponse de l’utilisateur', async () => {
    expect(await requestTiltPermission(withPermission(async () => 'granted'))).toBe(true);
    expect(await requestTiltPermission(withPermission(async () => 'denied'))).toBe(false);
  });

  test('un refus qui lève (hors geste) est un refus, jamais une erreur', async () => {
    expect(
      await requestTiltPermission(
        withPermission(async () => {
          throw new Error('NotAllowedError');
        }),
      ),
    ).toBe(false);
  });
});
