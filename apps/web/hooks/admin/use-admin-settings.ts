'use client';

import { useState, useCallback } from 'react';
import { ConfigSection, ConfigSetting } from '@/types/admin-settings';

interface UseAdminSettingsReturn {
  settings: Map<string, ConfigSetting>;
  updateSetting: (key: string, value: string | number | boolean) => void;
  resetSetting: (key: string) => void;
  resetAll: () => void;
  hasChanges: boolean;
  getSettingsBySection: (sectionId: string) => ConfigSetting[];
}

/**
 * Hook for managing admin settings state
 * Handles setting updates, resets, and change tracking
 */
export function useAdminSettings(
  configSections: ConfigSection[]
): UseAdminSettingsReturn {
  const [settings, setSettings] = useState<Map<string, ConfigSetting>>(() => {
    const map = new Map<string, ConfigSetting>();
    configSections.forEach(section => {
      section.settings.forEach(setting => {
        map.set(setting.key, setting);
      });
    });
    return map;
  });

  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = useCallback(
    (key: string, value: string | number | boolean) => {
      setSettings(prev => {
        const newMap = new Map(prev);
        const setting = newMap.get(key);
        if (setting) {
          newMap.set(key, { ...setting, value });
        }
        return newMap;
      });
      setHasChanges(true);
    },
    []
  );

  const resetSetting = useCallback((key: string) => {
    setSettings(prev => {
      const newMap = new Map(prev);
      const setting = newMap.get(key);
      if (setting) {
        newMap.set(key, { ...setting, value: setting.defaultValue });
      }
      return newMap;
    });
    setHasChanges(true);
  }, []);

  const resetAll = useCallback(() => {
    setSettings(prev => {
      const newMap = new Map(prev);
      newMap.forEach((setting, key) => {
        newMap.set(key, { ...setting, value: setting.defaultValue });
      });
      return newMap;
    });
    setHasChanges(false);
  }, []);

  const getSettingsBySection = useCallback(
    (sectionId: string): ConfigSetting[] => {
      const section = configSections.find(s => s.id === sectionId);
      if (!section) return [];
      return section.settings.map(s => settings.get(s.key) || s);
    },
    [configSections, settings]
  );

  return {
    settings,
    updateSetting,
    resetSetting,
    resetAll,
    hasChanges,
    getSettingsBySection,
  };
}
