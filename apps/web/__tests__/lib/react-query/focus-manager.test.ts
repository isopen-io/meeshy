/**
 * Tests for lib/react-query/focus-manager.ts
 *
 * This module registers a custom focusManager event listener on window focus/blur
 * with a 5-second debounce. We test the debounce behaviour via fake timers.
 */

const mockSetEventListener = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  focusManager: {
    setEventListener: (...args: unknown[]) => mockSetEventListener(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const importModule = () => import('@/lib/react-query/focus-manager');

describe('focus-manager module', () => {
  it('calls focusManager.setEventListener on import', async () => {
    await importModule();
    expect(mockSetEventListener).toHaveBeenCalledTimes(1);
  });

  it('passes a function to setEventListener', async () => {
    await importModule();
    expect(typeof mockSetEventListener.mock.calls[0][0]).toBe('function');
  });

  describe('custom event listener behaviour', () => {
    let handleFocus: jest.Mock;
    let cleanup: () => void;
    let addSpy: jest.SpyInstance;
    let removeSpy: jest.SpyInstance;

    beforeEach(async () => {
      handleFocus = jest.fn();
      addSpy = jest.spyOn(window, 'addEventListener');
      removeSpy = jest.spyOn(window, 'removeEventListener');

      await importModule();

      const factory = mockSetEventListener.mock.calls[0][0] as (h: jest.Mock) => () => void;
      cleanup = factory(handleFocus);
    });

    afterEach(() => {
      cleanup?.();
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('registers focus and blur listeners on window', () => {
      expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function), false);
      expect(addSpy).toHaveBeenCalledWith('blur', expect.any(Function), false);
    });

    it('does not call handleFocus immediately on focus event', () => {
      window.dispatchEvent(new Event('focus'));
      expect(handleFocus).not.toHaveBeenCalled();
    });

    it('calls handleFocus(true) after debounce delay on focus', () => {
      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(5_000);
      expect(handleFocus).toHaveBeenCalledWith(true);
    });

    it('debounces rapid focus events — only fires once after last event', () => {
      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(2_000);
      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(5_000);
      expect(handleFocus).toHaveBeenCalledTimes(1);
      expect(handleFocus).toHaveBeenCalledWith(true);
    });

    it('calls handleFocus(false) immediately on blur event', () => {
      window.dispatchEvent(new Event('blur'));
      expect(handleFocus).toHaveBeenCalledWith(false);
    });

    it('cancels pending focus timer on blur', () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('blur'));
      jest.advanceTimersByTime(5_000);
      expect(handleFocus).toHaveBeenCalledWith(false);
      expect(handleFocus).not.toHaveBeenCalledWith(true);
    });

    it('cleanup removes event listeners from window', () => {
      cleanup();
      expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });
});
