/**
 * Tests for hooks/use-bot-protection.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useBotProtection, getBotProtectionPayload } from '@/hooks/use-bot-protection';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── returned shape ───────────────────────────────────────────────────────────

describe('returned shape', () => {
  it('exposes honeypotValue, honeypotFieldName, honeypotProps, validateSubmission, reset, jsVerified, timeElapsed', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current).toHaveProperty('honeypotValue');
    expect(result.current).toHaveProperty('honeypotFieldName');
    expect(result.current).toHaveProperty('honeypotProps');
    expect(result.current).toHaveProperty('validateSubmission');
    expect(result.current).toHaveProperty('reset');
    expect(result.current).toHaveProperty('jsVerified');
    expect(result.current).toHaveProperty('timeElapsed');
  });

  it('default honeypotFieldName is "website"', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current.honeypotFieldName).toBe('website');
  });

  it('custom honeypotFieldName', () => {
    const { result } = renderHook(() => useBotProtection({ honeypotFieldName: 'email2' }));
    expect(result.current.honeypotFieldName).toBe('email2');
  });

  it('honeypotValue starts empty', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current.honeypotValue).toBe('');
  });

  it('jsVerified starts false', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current.jsVerified).toBe(false);
  });

  it('jsVerified becomes true after 100ms', async () => {
    const { result } = renderHook(() => useBotProtection());
    act(() => { jest.advanceTimersByTime(100); });
    expect(result.current.jsVerified).toBe(true);
  });
});

// ─── honeypotProps ────────────────────────────────────────────────────────────

describe('honeypotProps', () => {
  it('name matches honeypotFieldName', () => {
    const { result } = renderHook(() => useBotProtection({ honeypotFieldName: 'trap' }));
    expect(result.current.honeypotProps.name).toBe('trap');
  });

  it('has tabIndex = -1', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current.honeypotProps.tabIndex).toBe(-1);
  });

  it('has aria-hidden = true', () => {
    const { result } = renderHook(() => useBotProtection());
    expect(result.current.honeypotProps['aria-hidden']).toBe(true);
  });

  it('onChange updates honeypotValue', () => {
    const { result } = renderHook(() => useBotProtection());
    act(() => {
      result.current.honeypotProps.onChange({ target: { value: 'spammer' } } as any);
    });
    expect(result.current.honeypotValue).toBe('spammer');
  });
});

// ─── validateSubmission — honeypot ────────────────────────────────────────────

describe('validateSubmission — honeypot', () => {
  it('returns isHuman = false when honeypot is filled', async () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 0 }));
    act(() => { jest.advanceTimersByTime(100); }); // js verified
    act(() => { result.current.setHoneypotValue('bot filled this'); });
    const res = result.current.validateSubmission();
    expect(res.isHuman).toBe(false);
    expect(res.botError).not.toBeNull();
  });

  it('returns isHuman = true when honeypot has only whitespace (trimmed = empty)', async () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 0 }));
    act(() => { jest.advanceTimersByTime(100); });
    act(() => { result.current.setHoneypotValue('   '); });
    expect(result.current.validateSubmission().isHuman).toBe(true);
  });
});

// ─── validateSubmission — timing ──────────────────────────────────────────────

describe('validateSubmission — timing', () => {
  it('returns isHuman = false when submitted before minSubmitTime', () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 2000 }));
    act(() => { jest.advanceTimersByTime(100); }); // js verified
    jest.advanceTimersByTime(1000); // only 1 second elapsed
    const res = result.current.validateSubmission();
    expect(res.isHuman).toBe(false);
  });

  it('returns isHuman = false when js not verified yet', () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 0 }));
    // Don't advance timers - jsVerified stays false
    const res = result.current.validateSubmission();
    expect(res.isHuman).toBe(false);
  });

  it('returns isHuman = true when all checks pass', () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 500 }));
    act(() => { jest.advanceTimersByTime(100); }); // js verified
    jest.advanceTimersByTime(500); // enough time elapsed
    const res = result.current.validateSubmission();
    expect(res.isHuman).toBe(true);
    expect(res.botError).toBeNull();
  });

  it('custom minSubmitTime = 0 passes with js verified', () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 0 }));
    act(() => { jest.advanceTimersByTime(100); }); // js verified
    expect(result.current.validateSubmission().isHuman).toBe(true);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears honeypotValue', () => {
    const { result } = renderHook(() => useBotProtection());
    act(() => { result.current.setHoneypotValue('bot'); });
    act(() => { result.current.reset(); });
    expect(result.current.honeypotValue).toBe('');
  });

  it('resets load time so fast submission fails again', () => {
    const { result } = renderHook(() => useBotProtection({ minSubmitTime: 1000 }));
    act(() => { jest.advanceTimersByTime(100); }); // js verified
    jest.advanceTimersByTime(1000); // enough time for submission
    act(() => { result.current.reset(); }); // reset load time
    // Now only 0ms elapsed since reset
    expect(result.current.validateSubmission().isHuman).toBe(false);
  });
});

// ─── getBotProtectionPayload ──────────────────────────────────────────────────

describe('getBotProtectionPayload', () => {
  it('returns _bp_time, _bp_js, _bp_ts', () => {
    const payload = getBotProtectionPayload(1234);
    expect(payload._bp_time).toBe(1234);
    expect(payload._bp_js).toBe(true);
    expect(typeof payload._bp_ts).toBe('number');
  });
});
