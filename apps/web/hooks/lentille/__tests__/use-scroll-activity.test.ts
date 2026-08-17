/**
 * WL-105 (LWS-10) — `useScrollActivity`, peau React de `scrollActivityLaw`.
 *
 * Unités MILLISECONDES de bout en bout (leçon des correctifs V3 : la loi
 * partagée est en ms, jamais en secondes).
 */
import { act, renderHook } from '@testing-library/react';
import { useScrollActivity } from '../use-scroll-activity';
import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

describe('useScrollActivity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-16T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('invisible à l’ouverture', () => {
    const { result } = renderHook(() => useScrollActivity());
    expect(result.current.visible).toBe(false);
  });

  it('devient visible dès `notifyScrolled`', () => {
    const { result } = renderHook(() => useScrollActivity());
    act(() => result.current.notifyScrolled());
    expect(result.current.visible).toBe(true);
  });

  it(`reste visible à ${SCROLL_ACTIVITY_LINGER_MS - 1}ms après le dernier scroll`, () => {
    const { result } = renderHook(() => useScrollActivity());
    act(() => result.current.notifyScrolled());
    act(() => jest.advanceTimersByTime(SCROLL_ACTIVITY_LINGER_MS - 1));
    expect(result.current.visible).toBe(true);
  });

  it(`devient invisible EXACTEMENT ${SCROLL_ACTIVITY_LINGER_MS}ms après le dernier scroll`, () => {
    const { result } = renderHook(() => useScrollActivity());
    act(() => result.current.notifyScrolled());
    act(() => jest.advanceTimersByTime(SCROLL_ACTIVITY_LINGER_MS));
    expect(result.current.visible).toBe(false);
  });

  it('un `notifyScrolled` intercalé réarme le minuteur (la fenêtre repart de zéro)', () => {
    const { result } = renderHook(() => useScrollActivity());
    act(() => result.current.notifyScrolled());
    act(() => jest.advanceTimersByTime(SCROLL_ACTIVITY_LINGER_MS - 100));
    expect(result.current.visible).toBe(true);

    act(() => result.current.notifyScrolled()); // réarme
    act(() => jest.advanceTimersByTime(SCROLL_ACTIVITY_LINGER_MS - 100));
    expect(result.current.visible).toBe(true); // n'aurait pas dû rester visible sans le réarmement

    act(() => jest.advanceTimersByTime(100));
    expect(result.current.visible).toBe(false);
  });
});
