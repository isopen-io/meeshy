import { usePreferences } from '@/hooks/use-preferences';
import type { PreferenceCategory, UsePreferencesOptions } from '@/types/preferences';

function createPreferenceHook<C extends PreferenceCategory>(category: C) {
  return (options?: UsePreferencesOptions) => usePreferences(category, options);
}

export const useNotificationPrefs = createPreferenceHook('notification');
export const usePrivacyPrefs = createPreferenceHook('privacy');
export const useAudioPrefs = createPreferenceHook('audio');
export const useVideoPrefs = createPreferenceHook('video');
export const useMessagePrefs = createPreferenceHook('message');
export const useDocumentPrefs = createPreferenceHook('document');
export const useApplicationPrefs = createPreferenceHook('application');
