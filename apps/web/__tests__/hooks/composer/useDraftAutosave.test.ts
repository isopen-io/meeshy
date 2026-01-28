import { renderHook, act } from '@testing-library/react';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';

describe('useDraftAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should save draft to localStorage after debounce', () => {
    const conversationId = 'conv-123';
    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    act(() => {
      result.current.saveDraft('Hello world');
    });

    // Advance timers by 2 seconds (debounce time)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const saved = localStorage.getItem(`draft-${conversationId}`);
    expect(saved).toBeTruthy();

    const parsed = JSON.parse(saved!);
    expect(parsed.content).toBe('Hello world');
    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('should restore draft on mount if less than 24h old', () => {
    const conversationId = 'conv-456';
    const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

    localStorage.setItem(`draft-${conversationId}`, JSON.stringify({
      content: 'Restored message',
      timestamp: recentTimestamp
    }));

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('Restored message');
  });

  it('should clear draft from localStorage and state', () => {
    const conversationId = 'conv-789';
    localStorage.setItem(`draft-${conversationId}`, JSON.stringify({
      content: 'To be cleared',
      timestamp: Date.now()
    }));

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('To be cleared');

    act(() => {
      result.current.clearDraft();
    });

    expect(localStorage.getItem(`draft-${conversationId}`)).toBeNull();
    expect(result.current.draft).toBe('');
  });

  it('should auto-clear draft older than 24h on mount', () => {
    const conversationId = 'conv-old';
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

    localStorage.setItem(`draft-${conversationId}`, JSON.stringify({
      content: 'Old draft',
      timestamp: oldTimestamp
    }));

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('');
    expect(localStorage.getItem(`draft-${conversationId}`)).toBeNull();
  });

  it('should handle JSON parse errors gracefully', () => {
    const conversationId = 'conv-error';
    localStorage.setItem(`draft-${conversationId}`, 'invalid-json{');

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    expect(result.current.draft).toBe('');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should not save when enabled is false', () => {
    const conversationId = 'conv-disabled';
    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: false })
    );

    act(() => {
      result.current.saveDraft('Should not save');
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(localStorage.getItem(`draft-${conversationId}`)).toBeNull();
  });

  it('should not save when conversationId is undefined', () => {
    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId: undefined, enabled: true })
    );

    act(() => {
      result.current.saveDraft('Should not save');
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Check that nothing was saved to localStorage
    expect(localStorage.length).toBe(0);
  });

  it('should debounce multiple rapid saves', () => {
    const conversationId = 'conv-debounce';
    const { result } = renderHook(() =>
      useDraftAutosave({ conversationId, enabled: true })
    );

    act(() => {
      result.current.saveDraft('First');
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    act(() => {
      result.current.saveDraft('Second');
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    act(() => {
      result.current.saveDraft('Third');
    });

    // Only advance enough time for the last debounce
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const saved = localStorage.getItem(`draft-${conversationId}`);
    expect(saved).toBeTruthy();

    const parsed = JSON.parse(saved!);
    expect(parsed.content).toBe('Third');
  });
});
