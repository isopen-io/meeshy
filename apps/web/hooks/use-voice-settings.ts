'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiService } from '@/services/api.service';
import { DEFAULT_VOICE_CLONING_SETTINGS } from '@meeshy/shared/types/voice-api';
import type { VoiceCloningUserSettings } from '@meeshy/shared/types/voice-api';
import { toast } from 'sonner';

interface UseVoiceSettingsReturn {
  // State
  voiceCloningSettings: VoiceCloningUserSettings;
  isSavingSettings: boolean;
  hasUnsavedChanges: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof VoiceCloningUserSettings>(
    key: K,
    value: VoiceCloningUserSettings[K]
  ) => void;
  saveSettings: () => Promise<void>;
  resetSettings: () => void;
}

/**
 * Hook pour gérer les paramètres de clonage vocal
 * Responsabilités:
 * - Chargement des settings depuis l'API
 * - Modification locale avec détection de changements
 * - Sauvegarde vers l'API
 * - Reset aux valeurs par défaut
 */
export function useVoiceSettings(): UseVoiceSettingsReturn {
  const [voiceCloningSettings, setVoiceCloningSettings] = useState<VoiceCloningUserSettings>(
    DEFAULT_VOICE_CLONING_SETTINGS
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const response = await apiService.get<{ success: boolean; data: any }>('/user-features/configuration');
      const configData = (response.data as any)?.data || response.data;

      if (response.success && configData) {
        setVoiceCloningSettings({
          voiceCloningExaggeration: configData.voiceCloningExaggeration ?? DEFAULT_VOICE_CLONING_SETTINGS.voiceCloningExaggeration,
          voiceCloningCfgWeight: configData.voiceCloningCfgWeight ?? DEFAULT_VOICE_CLONING_SETTINGS.voiceCloningCfgWeight,
          voiceCloningTemperature: configData.voiceCloningTemperature ?? DEFAULT_VOICE_CLONING_SETTINGS.voiceCloningTemperature,
          voiceCloningTopP: configData.voiceCloningTopP ?? DEFAULT_VOICE_CLONING_SETTINGS.voiceCloningTopP,
          voiceCloningQualityPreset: configData.voiceCloningQualityPreset ?? DEFAULT_VOICE_CLONING_SETTINGS.voiceCloningQualityPreset,
        });
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('[VoiceSettings] Error loading cloning settings:', err);
      toast.error('Failed to load voice settings');
    }
  }, []);

  const updateSetting = useCallback(<K extends keyof VoiceCloningUserSettings>(
    key: K,
    value: VoiceCloningUserSettings[K]
  ) => {
    setVoiceCloningSettings(prev => ({
      ...prev,
      [key]: value,
    }));
    setHasUnsavedChanges(true);
  }, []);

  const saveSettings = useCallback(async () => {
    setIsSavingSettings(true);
    try {
      const response = await apiService.put<{ success: boolean }>(
        '/user-features/configuration',
        voiceCloningSettings
      );

      if (response.success) {
        setHasUnsavedChanges(false);
        toast.success('Voice cloning settings saved');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (err) {
      console.error('[VoiceSettings] Error saving settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  }, [voiceCloningSettings]);

  const resetSettings = useCallback(() => {
    setVoiceCloningSettings(DEFAULT_VOICE_CLONING_SETTINGS);
    setHasUnsavedChanges(true);
  }, []);

  return {
    voiceCloningSettings,
    isSavingSettings,
    hasUnsavedChanges,
    loadSettings,
    updateSetting,
    saveSettings,
    resetSettings,
  };
}
