/**
 * Hook React pour la validation robuste des numéros de téléphone
 *
 * Utilise libphonenumber-js pour une validation stricte selon le pays sélectionné
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { CountryCode } from 'libphonenumber-js';
import {
  validatePhoneNumber,
  formatPhoneAsYouType,
  buildInternationalPhone,
  PhoneValidationResult
} from '@/utils/phone-validation-robust';
import { buildApiUrl } from '@/lib/config';

export type PhoneValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'exists';

export interface UsePhoneValidationOptions {
  /** Code pays sélectionné */
  countryCode: CountryCode;
  /** Numéro de téléphone à valider */
  phoneNumber: string;
  /** Désactiver la validation */
  disabled?: boolean;
  /** Vérifier la disponibilité sur le serveur */
  checkAvailability?: boolean;
  /** Délai avant vérification serveur (ms) */
  debounceMs?: number;
  /** Callback quand le numéro change de validité */
  onValidationChange?: (isValid: boolean, formatted?: string) => void;
  /** Valider automatiquement à chaque changement (défaut: false)
   * PERFORMANCE: Désactivé par défaut pour éviter validation continue.
   * Utilisez validate() manuellement au blur ou à la soumission. */
  validateOnChange?: boolean;
}

export interface UsePhoneValidationReturn {
  /** Statut de validation */
  status: PhoneValidationStatus;
  /** Message d'erreur */
  errorMessage: string;
  /** Résultat de validation détaillé */
  validationResult: PhoneValidationResult | null;
  /** Numéro formaté pour affichage */
  formattedForDisplay: string;
  /** Numéro au format E.164 (pour envoi au serveur) */
  formattedE164: string | null;
  /** Fonction de validation manuelle */
  validate: () => void;
  /** Formater pendant la frappe */
  formatAsYouType: (value: string) => string;
}

const AVAILABILITY_CHECK_DEBOUNCE = 800;

/**
 * Hook pour valider un numéro de téléphone avec libphonenumber-js
 */
export function usePhoneValidation({
  countryCode,
  phoneNumber,
  disabled = false,
  checkAvailability = false,
  debounceMs = AVAILABILITY_CHECK_DEBOUNCE,
  onValidationChange,
  validateOnChange = false
}: UsePhoneValidationOptions): UsePhoneValidationReturn {
  const [status, setStatus] = useState<PhoneValidationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationResult, setValidationResult] = useState<PhoneValidationResult | null>(null);
  const checkTimeout = useRef<NodeJS.Timeout>();
  const lastCheckedPhone = useRef<string>('');

  /**
   * Valide le format du numéro localement
   */
  const validateFormat = useCallback((): PhoneValidationResult => {
    const result = validatePhoneNumber(phoneNumber, countryCode);
    setValidationResult(result);

    if (!result.isValid) {
      setStatus('invalid');
      setErrorMessage(getErrorMessage(result.error));
    } else {
      setStatus('valid');
      setErrorMessage('');
    }

    return result;
  }, [phoneNumber, countryCode]);

  /**
   * Vérifie la disponibilité sur le serveur
   */
  const checkServerAvailability = useCallback(async (formattedPhone: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/auth/check-availability?phoneNumber=${encodeURIComponent(formattedPhone)}`)
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          if (result.data?.phoneNumberAvailable === false) {
            setStatus('exists');
            setErrorMessage('Ce numéro est déjà utilisé');
          } else {
            setStatus('valid');
            setErrorMessage('');
          }
        }
      }
    } catch (error) {
      console.error('Erreur vérification disponibilité téléphone:', error);
      // En cas d'erreur réseau, considérer comme valide côté client
      setStatus('valid');
      setErrorMessage('');
    }
  }, []);

  /**
   * Validation complète (format + disponibilité)
   */
  const performValidation = useCallback(async () => {
    if (disabled || !phoneNumber.trim()) {
      setStatus('idle');
      setErrorMessage('');
      setValidationResult(null);
      return;
    }

    // Validation du format
    const result = validateFormat();

    if (!result.isValid) {
      return;
    }

    // Notifier le changement
    if (onValidationChange) {
      onValidationChange(true, result.formatted);
    }

    // Vérifier la disponibilité si demandé
    if (checkAvailability && result.formatted) {
      // Éviter de vérifier le même numéro plusieurs fois
      if (lastCheckedPhone.current === result.formatted) {
        return;
      }

      lastCheckedPhone.current = result.formatted;
      setStatus('checking');

      // Debounce
      if (checkTimeout.current) {
        clearTimeout(checkTimeout.current);
      }

      checkTimeout.current = setTimeout(() => {
        checkServerAvailability(result.formatted!);
      }, debounceMs);
    }
  }, [
    disabled,
    phoneNumber,
    validateFormat,
    checkAvailability,
    checkServerAvailability,
    debounceMs,
    onValidationChange
  ]);

  /**
   * Formater pendant la frappe
   */
  const formatAsYouType = useCallback((value: string): string => {
    return formatPhoneAsYouType(value, countryCode);
  }, [countryCode]);

  /**
   * Effet de validation automatique (optionnel, désactivé par défaut pour performance)
   * IMPORTANT: validateOnChange=false par défaut pour éviter validation continue
   * qui cause des milliers de logs et bloque la machine.
   * Utilisez validate() manuellement au blur ou soumission du formulaire.
   */
  useEffect(() => {
    // PERFORMANCE: Ne valider automatiquement que si explicitement demandé
    if (!validateOnChange) {
      return;
    }

    performValidation();

    return () => {
      if (checkTimeout.current) {
        clearTimeout(checkTimeout.current);
      }
    };
  }, [performValidation, validateOnChange]);

  /**
   * Reset quand le pays change
   * PERFORMANCE: Ne valider que si validateOnChange est activé
   */
  useEffect(() => {
    lastCheckedPhone.current = '';
    if (validateOnChange && phoneNumber) {
      performValidation();
    }
  }, [countryCode, validateOnChange]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    errorMessage,
    validationResult,
    formattedForDisplay: validationResult?.national || phoneNumber,
    formattedE164: validationResult?.formatted || null,
    validate: performValidation,
    formatAsYouType
  };
}

/**
 * Obtient un message d'erreur lisible
 */
function getErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'phoneRequired':
      return 'Le numéro de téléphone est requis';
    case 'phoneInvalidFormat':
      return 'Format de numéro invalide';
    case 'phoneInvalidForCountry':
      return 'Numéro invalide pour le pays sélectionné';
    case 'phoneNeedsInternationalPrefix':
      return 'Le numéro doit commencer par + ou 00';
    case 'phoneTooShort':
      return 'Numéro trop court';
    case 'phoneTooLong':
      return 'Numéro trop long';
    default:
      return 'Numéro de téléphone invalide';
  }
}
