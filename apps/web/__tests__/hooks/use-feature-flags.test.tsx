/**
 * Tests for useFeatureFlags hook
 *
 * Tests cover:
 * - Feature flag reading
 * - isFeatureEnabled function
 * - getEnabledFeatures function
 * - isPasswordResetConfigured function
 * - Environment variable integration
 * - `lentille_list` (WL-100/LWS-10) : résolution searchParam > cookie > env > OFF,
 *   et l'effet cookie réellement APPLIQUÉ par le hook (pas seulement décrit)
 */

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { renderHook } from '@testing-library/react';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

function clearAllCookies(): void {
  document.cookie.split(';').forEach((entry) => {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  });
}

// Store original env
const originalEnv = process.env;

describe('useFeatureFlags', () => {
  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
    mockSearchParams = new URLSearchParams();
    clearAllCookies();

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    clearAllCookies();
    jest.restoreAllMocks();
  });

  describe('flags Object', () => {
    it('should return flags object', () => {
      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags).toBeDefined();
      expect(typeof result.current.flags).toBe('object');
    });

    it('should include passwordReset flag', () => {
      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags).toHaveProperty('passwordReset');
      expect(typeof result.current.flags.passwordReset).toBe('boolean');
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return false when passwordReset is not enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'false';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isFeatureEnabled('passwordReset')).toBe(false);
    });

    it('should return true when passwordReset is enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isFeatureEnabled('passwordReset')).toBe(true);
    });

    it('should return false for undefined feature flags', () => {
      const { result } = renderHook(() => useFeatureFlags());

      // TypeScript would prevent this normally, but test for safety
      expect(result.current.isFeatureEnabled('unknownFeature' as any)).toBe(false);
    });

    it('should return false when env var is not set', () => {
      delete process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET;

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isFeatureEnabled('passwordReset')).toBe(false);
    });

    it('should return false for non-true string values', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = '1';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isFeatureEnabled('passwordReset')).toBe(false);
    });

    it('should be case sensitive for true', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'TRUE';

      const { result } = renderHook(() => useFeatureFlags());

      // Should be false because 'TRUE' !== 'true'
      expect(result.current.isFeatureEnabled('passwordReset')).toBe(false);
    });
  });

  describe('getEnabledFeatures', () => {
    it('should return empty array when no features enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'false';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.getEnabledFeatures()).toEqual([]);
    });

    it('should return array with passwordReset when enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.getEnabledFeatures()).toContain('passwordReset');
    });

    it('should return array of strings', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';

      const { result } = renderHook(() => useFeatureFlags());

      const enabledFeatures = result.current.getEnabledFeatures();
      expect(Array.isArray(enabledFeatures)).toBe(true);
      enabledFeatures.forEach(feature => {
        expect(typeof feature).toBe('string');
      });
    });
  });

  describe('isPasswordResetConfigured', () => {
    it('should return false when passwordReset is disabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'false';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isPasswordResetConfigured()).toBe(false);
    });

    it('should return false when API URL is missing', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
      delete process.env.NEXT_PUBLIC_API_URL;

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isPasswordResetConfigured()).toBe(false);
    });

    it('should return true when passwordReset enabled and API URL set', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isPasswordResetConfigured()).toBe(true);
    });

    it('should return true with any valid API URL', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.isPasswordResetConfigured()).toBe(true);
    });
  });

  describe('Return Type', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current).toHaveProperty('flags');
      expect(result.current).toHaveProperty('isFeatureEnabled');
      expect(result.current).toHaveProperty('getEnabledFeatures');
      expect(result.current).toHaveProperty('isPasswordResetConfigured');
    });

    it('should return functions for all methods', () => {
      const { result } = renderHook(() => useFeatureFlags());

      expect(typeof result.current.isFeatureEnabled).toBe('function');
      expect(typeof result.current.getEnabledFeatures).toBe('function');
      expect(typeof result.current.isPasswordResetConfigured).toBe('function');
    });
  });

  describe('Consistency', () => {
    it('should return consistent flags on rerender', () => {
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET = 'true';

      const { result, rerender } = renderHook(() => useFeatureFlags());

      const firstFlags = result.current.flags;

      rerender();

      expect(result.current.flags.passwordReset).toBe(firstFlags.passwordReset);
    });
  });

  describe('lentille_list (WL-100/LWS-10) — unique décideur du web', () => {
    it('OFF par défaut (aucun searchParam, aucun cookie, aucun env)', () => {
      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(false);
      expect(result.current.isFeatureEnabled('lentille_list')).toBe(false);
    });

    it('?lentille=1 → actif, ET pose le cookie meeshy_lentille=1 (effet appliqué par le hook)', () => {
      mockSearchParams = new URLSearchParams('lentille=1');

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(true);
      expect(document.cookie).toContain('meeshy_lentille=1');
    });

    it('?lentille=0 → inactif, ET efface un cookie meeshy_lentille=1 préexistant', () => {
      document.cookie = 'meeshy_lentille=1; path=/';
      mockSearchParams = new URLSearchParams('lentille=0');

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(false);
      expect(document.cookie).not.toContain('meeshy_lentille=1');
    });

    it('cookie meeshy_lentille=1 (sans searchParam) → actif, persiste entre visites', () => {
      document.cookie = 'meeshy_lentille=1; path=/';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(true);
    });

    it('NEXT_PUBLIC_LENTILLE_DEFAULT=true (sans searchParam ni cookie) → actif', () => {
      process.env.NEXT_PUBLIC_LENTILLE_DEFAULT = 'true';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(true);
    });

    it('précédence : searchParam=0 gagne sur un cookie=1 ET un env=true déjà présents', () => {
      document.cookie = 'meeshy_lentille=1; path=/';
      process.env.NEXT_PUBLIC_LENTILLE_DEFAULT = 'true';
      mockSearchParams = new URLSearchParams('lentille=0');

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(false);
      expect(document.cookie).not.toContain('meeshy_lentille=1');
    });

    it('précédence : cookie gagne sur env en l\'absence de searchParam', () => {
      document.cookie = 'meeshy_lentille=1; path=/';
      process.env.NEXT_PUBLIC_LENTILLE_DEFAULT = 'false';

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.flags.lentille_list).toBe(true);
    });

    it('apparaît dans getEnabledFeatures() une fois actif', () => {
      mockSearchParams = new URLSearchParams('lentille=1');

      const { result } = renderHook(() => useFeatureFlags());

      expect(result.current.getEnabledFeatures()).toContain('lentille_list');
    });

    it('n\'écrit jamais le cookie quand aucun searchParam ne le demande (cookie/env seuls)', () => {
      process.env.NEXT_PUBLIC_LENTILLE_DEFAULT = 'true';

      renderHook(() => useFeatureFlags());

      expect(document.cookie).not.toContain('meeshy_lentille=');
    });
  });
});
