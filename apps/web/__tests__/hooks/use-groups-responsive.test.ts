/**
 * Tests for hooks/use-groups-responsive.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useGroupsResponsive } from '@/hooks/use-groups-responsive';

// Control window.innerWidth via Object.defineProperty
const setWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
};

beforeEach(() => {
  setWindowWidth(1024); // desktop default
});

// ─── initial state ─────────────────────────────────────────────────────────────

describe('initial state on desktop', () => {
  it('isMobile is false when window width >= 768', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useGroupsResponsive(null));
    expect(result.current.isMobile).toBe(false);
  });

  it('showGroupsList is true on desktop regardless of selected group', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useGroupsResponsive('group-1'));
    expect(result.current.showGroupsList).toBe(true);
  });
});

describe('initial state on mobile', () => {
  it('isMobile is true when window width < 768', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useGroupsResponsive(null));
    expect(result.current.isMobile).toBe(true);
  });

  it('showGroupsList is true on mobile when no group is selected', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useGroupsResponsive(null));
    expect(result.current.showGroupsList).toBe(true);
  });

  it('showGroupsList is false on mobile when a group is selected', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useGroupsResponsive('group-1'));
    expect(result.current.showGroupsList).toBe(false);
  });
});

// ─── setShowGroupsList ────────────────────────────────────────────────────────

describe('setShowGroupsList', () => {
  it('allows manually toggling showGroupsList', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useGroupsResponsive(null));
    act(() => {
      result.current.setShowGroupsList(false);
    });
    expect(result.current.showGroupsList).toBe(false);
  });
});

// ─── resize events ────────────────────────────────────────────────────────────

describe('resize handling', () => {
  it('switches to mobile mode when resized below 768', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useGroupsResponsive(null));
    expect(result.current.isMobile).toBe(false);

    act(() => setWindowWidth(375));
    expect(result.current.isMobile).toBe(true);
  });

  it('returns to desktop mode when resized above 768', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useGroupsResponsive(null));
    expect(result.current.isMobile).toBe(true);

    act(() => setWindowWidth(1200));
    expect(result.current.isMobile).toBe(false);
  });

  it('shows groups list on desktop even when a group is selected and resized', () => {
    setWindowWidth(375);
    const { result } = renderHook(() => useGroupsResponsive('group-1'));
    expect(result.current.showGroupsList).toBe(false);

    act(() => setWindowWidth(1024));
    expect(result.current.showGroupsList).toBe(true);
  });
});
