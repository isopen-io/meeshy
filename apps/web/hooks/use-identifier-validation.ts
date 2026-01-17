import { useState, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api.service';
import type { ConversationType } from '@meeshy/shared/types';

interface UseIdentifierValidationReturn {
  identifierAvailable: boolean | null;
  isCheckingIdentifier: boolean;
  validateIdentifierFormat: (identifier: string) => boolean;
  checkIdentifierAvailability: (identifier: string) => Promise<void>;
  generateIdentifierFromTitle: (title: string) => string;
}

/**
 * Hook pour valider et générer des identifiants de conversation
 */
export function useIdentifierValidation(
  customIdentifier: string,
  conversationType: ConversationType
): UseIdentifierValidationReturn {
  const [identifierAvailable, setIdentifierAvailable] = useState<boolean | null>(null);
  const [isCheckingIdentifier, setIsCheckingIdentifier] = useState(false);

  // Validation du format de l'identifier
  const validateIdentifierFormat = useCallback((identifier: string): boolean => {
    const regex = /^[a-zA-Z0-9\-_@]+$/;
    return regex.test(identifier);
  }, []);

  // Générer un identifier depuis le titre avec suffixe hex
  const generateIdentifierFromTitle = useCallback((title: string): string => {
    if (!title.trim()) return '';

    const baseIdentifier = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!baseIdentifier) return '';

    // Générer un suffixe hex de 4 bytes pour l'unicité
    const hexSuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return `${baseIdentifier}-${hexSuffix}`;
  }, []);

  // Vérifier la disponibilité de l'identifier
  const checkIdentifierAvailability = useCallback(async (identifier: string) => {
    if (!identifier || identifier.length < 3) {
      setIdentifierAvailable(null);
      return;
    }

    setIsCheckingIdentifier(true);
    try {
      const response = await apiService.get<{ success: boolean; available: boolean }>(
        `/conversations/check-identifier/${encodeURIComponent(identifier)}`
      );
      if (response.data && response.data.success) {
        setIdentifierAvailable(response.data.available);
      } else {
        setIdentifierAvailable(null);
      }
    } catch (error) {
      console.error('Erreur vérification identifier:', error);
      setIdentifierAvailable(null);
    } finally {
      setIsCheckingIdentifier(false);
    }
  }, []);

  // Vérification automatique avec debounce
  useEffect(() => {
    if (conversationType === 'direct') {
      setIdentifierAvailable(null);
      return;
    }

    if (!customIdentifier || customIdentifier.length < 3) {
      setIdentifierAvailable(null);
      return;
    }

    if (!validateIdentifierFormat(customIdentifier)) {
      setIdentifierAvailable(null);
      return;
    }

    const timer = setTimeout(() => {
      checkIdentifierAvailability(customIdentifier);
    }, 300);

    return () => clearTimeout(timer);
  }, [customIdentifier, conversationType, validateIdentifierFormat, checkIdentifierAvailability]);

  return {
    identifierAvailable,
    isCheckingIdentifier,
    validateIdentifierFormat,
    checkIdentifierAvailability,
    generateIdentifierFromTitle
  };
}
