/**
 * Validation des numéros de téléphone
 *
 * Règles (alignées E.164):
 * - Obligatoire
 * - Peut commencer par + ou 00 (préfixe international optionnel)
 * - Contient uniquement des chiffres (après préfixe optionnel)
 * - Longueur: 8-15 chiffres (le préfixe international +/00 n'entre PAS dans le budget)
 */

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valide un numéro de téléphone selon les règles définies
 *
 * Le format est vérifié avant la longueur, et la longueur porte sur le nombre de
 * chiffres (hors préfixe international +/00) — conforme E.164 (max 15 chiffres),
 * de sorte que le même numéro reçoit le même verdict quelle que soit la graphie du préfixe.
 */
export function validatePhoneNumber(phone: string): PhoneValidationResult {
  // Vérifier si vide
  if (!phone || phone.trim() === '') {
    return {
      isValid: false,
      error: 'phoneRequired' // Clé de traduction
    };
  }

  const trimmed = phone.trim();

  // Vérifier le format d'abord
  // Peut commencer par + ou 00 (optionnel), suivi uniquement de chiffres
  // Accepte aussi les numéros sans préfixe
  const phoneRegex = /^(\+|00)?\d+$/;

  if (!phoneRegex.test(trimmed)) {
    return {
      isValid: false,
      error: 'phoneInvalidFormat' // Clé de traduction
    };
  }

  // Vérifier la longueur sur les chiffres uniquement (hors préfixe international +/00)
  const digits = trimmed.replace(/^(\+|00)/, '');

  if (digits.length < 8) {
    return {
      isValid: false,
      error: 'phoneTooShort' // Clé de traduction
    };
  }

  if (digits.length > 15) {
    return {
      isValid: false,
      error: 'phoneTooLong' // Clé de traduction
    };
  }

  return {
    isValid: true
  };
}

/**
 * Formate un numéro de téléphone en temps réel pendant la saisie
 * Enlève tous les caractères invalides (espaces, tirets, etc.)
 * Accepte +, 00 au début ou juste des chiffres
 */
export function formatPhoneNumberInput(value: string): string {
  // Si vide, retourner tel quel
  if (!value) return '';

  // Si commence par 00, garder et ajouter seulement des chiffres après
  if (value.startsWith('00')) {
    const rest = value.slice(2).replace(/\D/g, ''); // Enlever tous les non-chiffres
    return '00' + rest;
  }

  // Si commence par +, garder et ajouter seulement des chiffres après
  if (value.startsWith('+')) {
    const rest = value.slice(1).replace(/\D/g, ''); // Enlever tous les non-chiffres
    return '+' + rest;
  }

  // Sinon, accepter juste les chiffres (pas de préfixe forcé)
  const cleaned = value.replace(/\D/g, '');
  return cleaned;
}

/**
 * Obtient un message d'erreur de validation lisible
 * Retourne la clé de traduction ou null si valide
 */
export function getPhoneValidationError(phone: string): string | null {
  const result = validatePhoneNumber(phone);
  return result.isValid ? null : result.error || 'phoneInvalid';
}

/**
 * Traduit une clé d'erreur de téléphone
 * Utilisé pour afficher les messages d'erreur à l'utilisateur
 */
export function translatePhoneError(errorKey: string, t: (key: string) => string): string {
  // Map des clés vers les clés de traduction
  const translationKeys: Record<string, string> = {
    phoneRequired: 'register.validation.phoneRequired',
    phoneTooShort: 'register.validation.phoneTooShort',
    phoneTooLong: 'register.validation.phoneTooLong',
    phoneInvalidFormat: 'register.validation.phoneInvalidFormat',
    phoneInvalid: 'register.validation.phoneInvalid'
  };

  const translationKey = translationKeys[errorKey] || translationKeys.phoneInvalid;
  return t(translationKey);
}

/**
 * Vérifie si le numéro de téléphone est valide (version simple)
 */
export function isValidPhoneNumber(phone: string): boolean {
  return validatePhoneNumber(phone).isValid;
}

/**
 * Exemples de numéros valides (longueur mesurée sur les chiffres, hors préfixe +/00):
 * - +33612345678 (10 chiffres, avec préfixe +)
 * - 0033612345678 (11 chiffres, avec préfixe 00)
 * - 612345678 (9 chiffres, sans préfixe)
 * - +123456789012345 (15 chiffres, maximum E.164 avec préfixe +)
 * - 12345678901 (11 chiffres, sans préfixe)
 *
 * Exemples de numéros invalides:
 * - 123456 (trop court, < 8 chiffres)
 * - +1234567890123456 (trop long, > 15 chiffres)
 * - +33 6 12 34 56 78 (espaces non autorisés → format invalide)
 * - +33-6-12-34-56-78 (tirets non autorisés → format invalide)
 * - abc123456789 (lettres non autorisées → format invalide)
 */
