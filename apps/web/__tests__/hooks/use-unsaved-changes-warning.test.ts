/**
 * Tests for hooks/use-unsaved-changes-warning.ts
 */

jest.mock('@tanstack/react-query', () => ({
  useIsMutating: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning';
import { useIsMutating } from '@tanstack/react-query';

const mockUseIsMutating = useIsMutating as jest.Mock;

beforeEach(() => {
  mockUseIsMutating.mockReturnValue(0);
});

// ─── hasPendingChanges ────────────────────────────────────────────────────────

describe('hasPendingChanges', () => {
  it('is false when there are no pending mutations', () => {
    const { result } = renderHook(() => useUnsavedChangesWarning());
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('is true when there are pending mutations', () => {
    mockUseIsMutating.mockReturnValue(2);
    const { result } = renderHook(() => useUnsavedChangesWarning());
    expect(result.current.hasPendingChanges).toBe(true);
  });

  it('is false when disabled even with pending mutations', () => {
    mockUseIsMutating.mockReturnValue(3);
    const { result } = renderHook(() => useUnsavedChangesWarning(false));
    expect(result.current.hasPendingChanges).toBe(false);
  });
});

// ─── beforeunload event ───────────────────────────────────────────────────────

describe('beforeunload event', () => {
  it('calls e.preventDefault() when there are pending mutations', () => {
    mockUseIsMutating.mockReturnValue(1);
    renderHook(() => useUnsavedChangesWarning());
    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not call e.preventDefault() when there are no mutations', () => {
    renderHook(() => useUnsavedChangesWarning());
    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not call e.preventDefault() when disabled', () => {
    mockUseIsMutating.mockReturnValue(5);
    renderHook(() => useUnsavedChangesWarning(false));
    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes the event listener on unmount', () => {
    const spy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useUnsavedChangesWarning());
    unmount();
    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    spy.mockRestore();
  });
});
