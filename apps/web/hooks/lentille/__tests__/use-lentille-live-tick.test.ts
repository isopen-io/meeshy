/**
 * D-12 soldée (L14) — `useLentilleLiveTick` : le tick partagé lui-même.
 *
 * Trois preuves distinctes de la « mutualisation » (patron R6-6, `b31ed71e`) :
 *  1. N abonnés simultanés ⇒ UN SEUL `setInterval` (jamais un minuteur par
 *     rang) ;
 *  2. chaque abonné se re-rend au tick (la valeur retournée change) ;
 *  3. le dernier départ arrête l'intervalle — pas de fuite en navigation ;
 *     un abonné restant garde l'intervalle vivant pour lui.
 */
import { renderHook, act } from '@testing-library/react';
import { useLentilleLiveTick, __lentilleLiveTickDebugState } from '../use-lentille-live-tick';

describe('useLentilleLiveTick — tick mutualisé 60s (D-12)', () => {
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    setIntervalSpy = jest.spyOn(global, 'setInterval');
  });

  afterEach(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  it('trois rangs montés en même temps ⇒ UN SEUL setInterval (pas un minuteur par rang)', () => {
    const a = renderHook(() => useLentilleLiveTick());
    const b = renderHook(() => useLentilleLiveTick());
    const c = renderHook(() => useLentilleLiveTick());

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(__lentilleLiveTickDebugState()).toEqual({ subscriberCount: 3, intervalActive: true });

    a.unmount();
    b.unmount();
    c.unmount();
  });

  it('chaque abonné se re-rend au tick de 60s (la valeur retournée change)', () => {
    const { result, unmount } = renderHook(() => useLentilleLiveTick());
    const before = result.current;

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).not.toBe(before);
    unmount();
  });

  it("n'avance pas avant 60s (pas de re-rendu prématuré)", () => {
    const { result, unmount } = renderHook(() => useLentilleLiveTick());
    const before = result.current;

    act(() => {
      jest.advanceTimersByTime(59_999);
    });

    expect(result.current).toBe(before);
    unmount();
  });

  it('le dernier abonné qui se démonte arrête l’intervalle — aucune fuite en navigation', () => {
    const a = renderHook(() => useLentilleLiveTick());
    const b = renderHook(() => useLentilleLiveTick());

    expect(__lentilleLiveTickDebugState()).toEqual({ subscriberCount: 2, intervalActive: true });

    a.unmount();
    expect(__lentilleLiveTickDebugState()).toEqual({ subscriberCount: 1, intervalActive: true });

    b.unmount();
    expect(__lentilleLiveTickDebugState()).toEqual({ subscriberCount: 0, intervalActive: false });
  });

  it('un nouvel abonné après extinction complète redémarre proprement un intervalle', () => {
    const a = renderHook(() => useLentilleLiveTick());
    a.unmount();
    expect(__lentilleLiveTickDebugState().intervalActive).toBe(false);

    setIntervalSpy.mockClear();
    const b = renderHook(() => useLentilleLiveTick());
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(__lentilleLiveTickDebugState()).toEqual({ subscriberCount: 1, intervalActive: true });
    b.unmount();
  });
});
