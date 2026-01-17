'use client';

import { useState, useCallback } from 'react';
import { ConfigSetting } from '@/types/admin-settings';

interface UseSettingsSaveReturn {
  isSaving: boolean;
  saveError: string | null;
  saveSettings: (settings: Map<string, ConfigSetting>) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for saving admin settings
 * Handles API communication and error states
 */
export function useSettingsSave(): UseSettingsSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveSettings = useCallback(
    async (settings: Map<string, ConfigSetting>) => {
      setIsSaving(true);
      setSaveError(null);

      try {
        const payload = Array.from(settings.values())
          .filter(s => s.implemented)
          .map(s => ({
            key: s.key,
            value: s.value,
            envVar: s.envVar,
          }));

        // TODO: Implement API call to save settings
        console.log('Saving settings:', payload);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if we need to notify about restart requirement
        const requiresRestart = payload.some(
          s =>
            s.key.includes('PORT') ||
            s.key.includes('DATABASE') ||
            s.key === 'NODE_ENV'
        );

        if (requiresRestart) {
          console.warn('Some settings require server restart to take effect');
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Erreur lors de la sauvegarde';
        setSaveError(message);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setSaveError(null);
  }, []);

  return {
    isSaving,
    saveError,
    saveSettings,
    clearError,
  };
}
