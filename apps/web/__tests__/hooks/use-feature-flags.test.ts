/**
 * Tests for hooks/use-feature-flags.ts
 */

import { renderHook } from '@testing-library/react';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// ─── flags object ─────────────────────────────────────────────────────────────

describe('flags', () => {
  it('exposes a flags object with a passwordReset key', () => {
    const { result } = renderHook(() => useFeatureFlags());
    expect(typeof result.current.flags).toBe('object');
    expect('passwordReset' in result.current.flags).toBe(true);
  });

  it('passwordReset is false when env var is absent', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET;
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags.passwordReset).toBe(false);
  });

  it('passwordReset is true when env var is "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags.passwordReset).toBe(true);
  });

  it('passwordReset is false when env var is "false"', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'false';
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags.passwordReset).toBe(false);
  });
});

// ─── isFeatureEnabled ─────────────────────────────────────────────────────────

describe('isFeatureEnabled', () => {
  it('returns false when the feature flag is disabled', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET;
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isFeatureEnabled('passwordReset')).toBe(false);
  });

  it('returns true when the feature flag is enabled', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isFeatureEnabled('passwordReset')).toBe(true);
  });
});

// ─── getEnabledFeatures ───────────────────────────────────────────────────────

describe('getEnabledFeatures', () => {
  it('returns an empty array when no features are enabled', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET;
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.getEnabledFeatures()).toEqual([]);
  });

  it('returns enabled feature names when a feature is on', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.getEnabledFeatures()).toContain('passwordReset');
  });
});

// ─── isPasswordResetConfigured ────────────────────────────────────────────────

describe('isPasswordResetConfigured', () => {
  it('returns false when the passwordReset flag is disabled', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET;
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isPasswordResetConfigured()).toBe(false);
  });

  it('returns false when flag is enabled but NEXT_PUBLIC_API_URL is absent', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
    delete process.env.NEXT_PUBLIC_API_URL;
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isPasswordResetConfigured()).toBe(false);
  });

  it('returns true when flag is enabled and NEXT_PUBLIC_API_URL is set', () => {
    process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isPasswordResetConfigured()).toBe(true);
  });
});
