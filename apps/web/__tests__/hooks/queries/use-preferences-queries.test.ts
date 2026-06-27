/**
 * Tests for hooks/queries/use-preferences-queries.ts
 * Verifies each preference hook passes the correct category to usePreferences.
 */

const mockUsePreferences = jest.fn(() => ({ preferences: {}, updatePreference: jest.fn() }));

jest.mock('@/hooks/use-preferences', () => ({
  usePreferences: (...args: unknown[]) => mockUsePreferences(...args),
}));

import { renderHook } from '@testing-library/react';
import {
  useNotificationPrefs,
  usePrivacyPrefs,
  useAudioPrefs,
  useVideoPrefs,
  useMessagePrefs,
  useDocumentPrefs,
  useApplicationPrefs,
} from '@/hooks/queries/use-preferences-queries';

beforeEach(() => { mockUsePreferences.mockClear(); });

const cases: [string, () => unknown, string][] = [
  ['useNotificationPrefs', () => useNotificationPrefs(), 'notification'],
  ['usePrivacyPrefs', () => usePrivacyPrefs(), 'privacy'],
  ['useAudioPrefs', () => useAudioPrefs(), 'audio'],
  ['useVideoPrefs', () => useVideoPrefs(), 'video'],
  ['useMessagePrefs', () => useMessagePrefs(), 'message'],
  ['useDocumentPrefs', () => useDocumentPrefs(), 'document'],
  ['useApplicationPrefs', () => useApplicationPrefs(), 'application'],
];

describe.each(cases)('%s', (name, hook, expectedCategory) => {
  it(`calls usePreferences with category='${expectedCategory}'`, () => {
    renderHook(hook);
    expect(mockUsePreferences).toHaveBeenCalledWith(expectedCategory, undefined);
  });

  it('forwards options to usePreferences', () => {
    const opts = { enabled: false };
    const hookWithOpts = () => {
      if (name === 'useNotificationPrefs') return useNotificationPrefs(opts);
      if (name === 'usePrivacyPrefs') return usePrivacyPrefs(opts);
      if (name === 'useAudioPrefs') return useAudioPrefs(opts);
      if (name === 'useVideoPrefs') return useVideoPrefs(opts);
      if (name === 'useMessagePrefs') return useMessagePrefs(opts);
      if (name === 'useDocumentPrefs') return useDocumentPrefs(opts);
      return useApplicationPrefs(opts);
    };
    renderHook(hookWithOpts);
    expect(mockUsePreferences).toHaveBeenCalledWith(expectedCategory, opts);
  });
});
