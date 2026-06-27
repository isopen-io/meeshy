/**
 * Tests for hooks/use-message-view-state.tsx
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MessageViewProvider, useMessageViewState, useMessageView } from '@/hooks/use-message-view-state';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MessageViewProvider>{children}</MessageViewProvider>
);

// ─── useMessageViewState ──────────────────────────────────────────────────────

describe('useMessageViewState', () => {
  it('throws when used outside MessageViewProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMessageViewState())).toThrow(
      'useMessageViewState must be used within a MessageViewProvider'
    );
    spy.mockRestore();
  });

  it('starts with no active view', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.activeView).toBeNull();
  });
});

// ─── activateView / deactivateView ────────────────────────────────────────────

describe('activateView', () => {
  it('activates a view for a message', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'reaction');
    });
    expect(result.current.activeView?.messageId).toBe('msg-1');
    expect(result.current.activeView?.mode).toBe('reaction');
  });

  it('stores optional data with the view', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'language', { lang: 'fr' });
    });
    expect(result.current.activeView?.data).toEqual({ lang: 'fr' });
  });
});

describe('deactivateView', () => {
  it('clears the active view', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'reaction');
    });
    act(() => {
      result.current.deactivateView();
    });
    expect(result.current.activeView).toBeNull();
  });
});

// ─── isViewActive ─────────────────────────────────────────────────────────────

describe('isViewActive', () => {
  it('returns false when no view is active', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.isViewActive('msg-1')).toBe(false);
  });

  it('returns false for a different message', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'reaction');
    });
    expect(result.current.isViewActive('msg-2')).toBe(false);
  });

  it('returns true for the active message without mode filter', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'reaction');
    });
    expect(result.current.isViewActive('msg-1')).toBe(true);
  });

  it('returns true for the active message with matching mode', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'edit');
    });
    expect(result.current.isViewActive('msg-1', 'edit')).toBe(true);
  });

  it('returns false for the active message with non-matching mode', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'edit');
    });
    expect(result.current.isViewActive('msg-1', 'delete')).toBe(false);
  });
});

// ─── canTransition ────────────────────────────────────────────────────────────

describe('canTransition', () => {
  it('allows normal → reaction', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('normal', 'reaction')).toBe(true);
  });

  it('allows normal → edit', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('normal', 'edit')).toBe(true);
  });

  it('allows normal → delete', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('normal', 'delete')).toBe(true);
  });

  it('allows normal → report', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('normal', 'report')).toBe(true);
  });

  it('allows reaction → normal', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('reaction', 'normal')).toBe(true);
  });

  it('disallows reaction → edit', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('reaction', 'edit')).toBe(false);
  });

  it('disallows edit → delete', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    expect(result.current.canTransition('edit', 'delete')).toBe(false);
  });

  it('activateView does not transition when disallowed', () => {
    const { result } = renderHook(() => useMessageViewState(), { wrapper });
    act(() => {
      result.current.activateView('msg-1', 'reaction');
    });
    // reaction → edit is NOT in the allowed map
    act(() => {
      result.current.activateView('msg-1', 'edit');
    });
    // Should still be in reaction mode
    expect(result.current.activeView?.mode).toBe('reaction');
  });
});

// ─── useMessageView ───────────────────────────────────────────────────────────

describe('useMessageView', () => {
  it('currentMode is normal when no view is active', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    expect(result.current.currentMode).toBe('normal');
  });

  it('currentMode reflects active mode for the message', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterReactionMode();
    });
    expect(result.current.currentMode).toBe('reaction');
  });

  it('enterEditMode sets mode to edit', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterEditMode();
    });
    expect(result.current.currentMode).toBe('edit');
  });

  it('enterDeleteMode sets mode to delete', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterDeleteMode();
    });
    expect(result.current.currentMode).toBe('delete');
  });

  it('enterReportMode sets mode to report', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterReportMode();
    });
    expect(result.current.currentMode).toBe('report');
  });

  it('enterLanguageMode stores data', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterLanguageMode({ targetLang: 'es' });
    });
    expect(result.current.currentMode).toBe('language');
    expect(result.current.currentData).toEqual({ targetLang: 'es' });
  });

  it('exitMode clears the view', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterReactionMode();
    });
    act(() => {
      result.current.exitMode();
    });
    expect(result.current.currentMode).toBe('normal');
  });

  it('exitMode does nothing when view is not active for this message', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    // No active view — exitMode should not throw
    expect(() => {
      act(() => {
        result.current.exitMode();
      });
    }).not.toThrow();
  });

  it('isActive returns false when mode is normal', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    expect(result.current.isActive()).toBe(false);
  });

  it('isActive returns true after entering a mode', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    act(() => {
      result.current.enterDeleteMode();
    });
    expect(result.current.isActive()).toBe(true);
  });

  it('canEnterMode checks valid transitions', () => {
    const { result } = renderHook(() => useMessageView('msg-1'), { wrapper });
    expect(result.current.canEnterMode('reaction')).toBe(true);
    expect(result.current.canEnterMode('edit')).toBe(true);
  });
});
