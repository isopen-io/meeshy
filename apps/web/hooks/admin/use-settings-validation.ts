'use client';

import { useMemo } from 'react';
import { ConfigSetting } from '@/types/admin-settings';

interface ValidationError {
  key: string;
  message: string;
}

interface UseSettingsValidationReturn {
  errors: ValidationError[];
  isValid: boolean;
  validateSetting: (setting: ConfigSetting) => string | null;
}

/**
 * Hook for validating admin settings
 * Ensures values meet type and constraint requirements
 */
export function useSettingsValidation(
  settings: Map<string, ConfigSetting>
): UseSettingsValidationReturn {
  const errors = useMemo(() => {
    const validationErrors: ValidationError[] = [];

    settings.forEach((setting, key) => {
      const error = validateSetting(setting);
      if (error) {
        validationErrors.push({ key, message: error });
      }
    });

    return validationErrors;
  }, [settings]);

  const validateSetting = (setting: ConfigSetting): string | null => {
    if (!setting.implemented) {
      return null;
    }

    switch (setting.type) {
      case 'number':
        if (typeof setting.value !== 'number' || isNaN(setting.value)) {
          return 'La valeur doit être un nombre valide';
        }
        if (setting.value < 0) {
          return 'La valeur ne peut pas être négative';
        }
        break;

      case 'text':
        if (typeof setting.value !== 'string') {
          return 'La valeur doit être du texte';
        }
        if (setting.value.trim() === '') {
          return 'Ce champ ne peut pas être vide';
        }
        if (setting.key.includes('URL') && !isValidUrl(setting.value)) {
          return 'URL invalide';
        }
        break;

      case 'boolean':
        if (typeof setting.value !== 'boolean') {
          return 'La valeur doit être true ou false';
        }
        break;

      case 'select':
        if (!setting.options?.some(opt => opt.value === setting.value)) {
          return 'Valeur de sélection invalide';
        }
        break;
    }

    return null;
  };

  return {
    errors,
    isValid: errors.length === 0,
    validateSetting,
  };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
