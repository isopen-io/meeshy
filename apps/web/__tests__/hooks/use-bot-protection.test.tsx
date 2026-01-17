/**
 * Tests for useBotProtection hook
 *
 * Tests cover:
 * - Honeypot field functionality
 * - Time-based validation
 * - JavaScript verification
 * - validateSubmission logic
 * - Reset functionality
 * - honeypotProps configuration
 */

import { renderHook, act } from '@testing-library/react';
import { useBotProtection, getBotProtectionPayload } from '@/hooks/use-bot-protection';

// Mock timers
jest.useFakeTimers();

describe('useBotProtection', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  describe('Initial State', () => {
    it('should return empty honeypotValue initially', () => {
      const { result } = renderHook(() => useBotProtection());

      expect(result.current.honeypotValue).toBe('');
    });

    it('should return honeypotFieldName', () => {
      const { result } = renderHook(() => useBotProtection());

      expect(result.current.honeypotFieldName).toBe('website');
    });

    it('should allow custom honeypotFieldName', () => {
      const { result } = renderHook(() =>
        useBotProtection({ honeypotFieldName: 'fax' })
      );

      expect(result.current.honeypotFieldName).toBe('fax');
    });

    it('should return timeElapsed as 0 initially', () => {
      const { result } = renderHook(() => useBotProtection());

      expect(result.current.timeElapsed).toBe(0);
    });

    it('should return jsVerified false initially', () => {
      const { result } = renderHook(() => useBotProtection());

      // Initially false, becomes true after 100ms
      expect(result.current.jsVerified).toBe(false);
    });
  });

  describe('JavaScript Verification', () => {
    it('should set jsVerified to true after 100ms', () => {
      const { result } = renderHook(() => useBotProtection());

      expect(result.current.jsVerified).toBe(false);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.jsVerified).toBe(true);
    });
  });

  describe('Time Elapsed', () => {
    it('should update timeElapsed periodically', () => {
      const { result } = renderHook(() => useBotProtection());

      expect(result.current.timeElapsed).toBe(0);

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.timeElapsed).toBeGreaterThan(0);
    });

    it('should continue increasing timeElapsed', () => {
      const { result } = renderHook(() => useBotProtection());

      act(() => {
        jest.advanceTimersByTime(500);
      });

      const firstTime = result.current.timeElapsed;

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.timeElapsed).toBeGreaterThan(firstTime);
    });
  });

  describe('Honeypot Value', () => {
    it('should allow setting honeypot value', () => {
      const { result } = renderHook(() => useBotProtection());

      act(() => {
        result.current.setHoneypotValue('bot-filled-this');
      });

      expect(result.current.honeypotValue).toBe('bot-filled-this');
    });
  });

  describe('validateSubmission', () => {
    it('should return isHuman true when all checks pass', () => {
      const { result } = renderHook(() =>
        useBotProtection({ minSubmitTime: 100 })
      );

      // Wait for JS verification
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Wait for min submit time
      act(() => {
        jest.advanceTimersByTime(100);
      });

      const validation = result.current.validateSubmission();

      expect(validation.isHuman).toBe(true);
      expect(validation.botError).toBeNull();
    });

    it('should fail when honeypot is filled', () => {
      const { result } = renderHook(() => useBotProtection());

      act(() => {
        result.current.setHoneypotValue('bot-value');
        jest.advanceTimersByTime(3000);
      });

      const validation = result.current.validateSubmission();

      expect(validation.isHuman).toBe(false);
      expect(validation.botError).toBe('Une erreur est survenue. Veuillez réessayer.');
    });

    it('should fail when submitted too quickly', () => {
      const { result } = renderHook(() =>
        useBotProtection({ minSubmitTime: 2000 })
      );

      // Only advance 500ms (less than minSubmitTime)
      act(() => {
        jest.advanceTimersByTime(500);
      });

      const validation = result.current.validateSubmission();

      expect(validation.isHuman).toBe(false);
      expect(validation.botError).toBe(
        'Veuillez patienter quelques secondes avant de soumettre le formulaire.'
      );
    });

    it('should fail when JS not verified', () => {
      const { result } = renderHook(() =>
        useBotProtection({ minSubmitTime: 0 })
      );

      // Don't advance time enough for JS verification
      const validation = result.current.validateSubmission();

      expect(validation.isHuman).toBe(false);
      expect(validation.botError).toBe('Veuillez activer JavaScript pour continuer.');
    });

    it('should use custom minSubmitTime', () => {
      const { result } = renderHook(() =>
        useBotProtection({ minSubmitTime: 5000 })
      );

      // JS verification
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // 3 seconds (less than 5000ms)
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      const validation = result.current.validateSubmission();

      expect(validation.isHuman).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset all protection state', () => {
      const { result } = renderHook(() => useBotProtection());

      // Fill honeypot
      act(() => {
        result.current.setHoneypotValue('bot-value');
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.honeypotValue).toBe('bot-value');
      expect(result.current.timeElapsed).toBeGreaterThan(0);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.honeypotValue).toBe('');
      expect(result.current.timeElapsed).toBe(0);
    });
  });

  describe('honeypotProps', () => {
    it('should return complete honeypot input props', () => {
      const { result } = renderHook(() => useBotProtection());

      const props = result.current.honeypotProps;

      expect(props).toHaveProperty('name', 'website');
      expect(props).toHaveProperty('value', '');
      expect(props).toHaveProperty('onChange');
      expect(props).toHaveProperty('style');
      expect(props).toHaveProperty('tabIndex', -1);
      expect(props).toHaveProperty('autoComplete', 'off');
      expect(props).toHaveProperty('aria-hidden', true);
    });

    it('should have hidden style properties', () => {
      const { result } = renderHook(() => useBotProtection());

      const { style } = result.current.honeypotProps;

      expect(style.position).toBe('absolute');
      expect(style.left).toBe('-9999px');
      expect(style.top).toBe('-9999px');
      expect(style.opacity).toBe(0);
      expect(style.pointerEvents).toBe('none');
    });

    it('should update value via onChange', () => {
      const { result } = renderHook(() => useBotProtection());

      act(() => {
        result.current.honeypotProps.onChange({
          target: { value: 'changed' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.honeypotValue).toBe('changed');
    });

    it('should use custom field name', () => {
      const { result } = renderHook(() =>
        useBotProtection({ honeypotFieldName: 'custom' })
      );

      expect(result.current.honeypotProps.name).toBe('custom');
    });
  });

  describe('Cleanup', () => {
    it('should clean up interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() => useBotProtection());

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it('should clean up timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const { unmount } = renderHook(() => useBotProtection());

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});

describe('getBotProtectionPayload', () => {
  it('should return payload object', () => {
    const payload = getBotProtectionPayload(2500);

    expect(payload).toHaveProperty('_bp_time', 2500);
    expect(payload).toHaveProperty('_bp_js', true);
    expect(payload).toHaveProperty('_bp_ts');
  });

  it('should include current timestamp', () => {
    const before = Date.now();
    const payload = getBotProtectionPayload(1000);
    const after = Date.now();

    expect(payload._bp_ts).toBeGreaterThanOrEqual(before);
    expect(payload._bp_ts).toBeLessThanOrEqual(after);
  });
});
