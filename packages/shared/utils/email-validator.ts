/**
 * Validateur d'email robuste selon RFC 5322
 *
 * Rejette les emails invalides comme:
 * - "debu@" (pas de domaine)
 * - "debute@email" (pas de TLD)
 * - "test@.com" (domaine commence par un point)
 * - "@example.com" (pas de partie locale)
 * - "user@domain" (pas de TLD)
 *
 * Accepte les emails valides comme:
 * - "user@example.com"
 * - "first.last@example.co.uk"
 * - "user+tag@example.com"
 * - "123@example.com"
 */

/**
 * Regex stricte pour validation d'email conforme RFC 5322 (simplifié)
 *
 * Structure:
 * - Partie locale (avant @): lettres, chiffres, points, tirets, underscores, plus
 * - @ obligatoire
 * - Domaine: au moins un sous-domaine avec lettres/chiffres/tirets
 * - Point obligatoire
 * - TLD: au moins 2 caractères (com, fr, io, etc.)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Valide un email de manière stricte
 * @param email - Email à valider
 * @returns true si l'email est valide, false sinon
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Trim et lowercase
  const trimmedEmail = email.trim().toLowerCase();

  // Vérifications basiques
  if (trimmedEmail.length < 3) {
    return false; // Minimum "a@b.c"
  }

  if (trimmedEmail.length > 255) {
    return false; // Max RFC 5321
  }

  // Doit contenir exactement un @
  const atCount = (trimmedEmail.match(/@/g) || []).length;
  if (atCount !== 1) {
    return false;
  }

  // Split par @
  const [localPart, domain] = trimmedEmail.split('@');

  // Vérifier partie locale
  if (!localPart || localPart.length === 0 || localPart.length > 64) {
    return false;
  }

  // Ne peut pas commencer ou finir par un point
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }

  // Pas de points consécutifs
  if (localPart.includes('..')) {
    return false;
  }

  // Vérifier domaine
  if (!domain || domain.length === 0 || domain.length > 253) {
    return false;
  }

  // Le domaine doit contenir au moins un point (pour le TLD)
  if (!domain.includes('.')) {
    return false;
  }

  // Ne peut pas commencer ou finir par un point ou tiret
  if (domain.startsWith('.') || domain.endsWith('.') ||
      domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }

  // Pas de points consécutifs
  if (domain.includes('..')) {
    return false;
  }

  // Le TLD doit avoir au moins 2 caractères
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return false;
  }

  // Vérification finale avec regex
  return EMAIL_REGEX.test(trimmedEmail);
}

/**
 * Valide et normalise un email
 * @param email - Email à valider
 * @returns Email normalisé (lowercase, trimmed) ou null si invalide
 */
export function validateAndNormalizeEmail(email: string): string | null {
  if (!isValidEmail(email)) {
    return null;
  }
  return email.trim().toLowerCase();
}

/**
 * Obtenir le message d'erreur approprié selon le problème détecté
 * @param email - Email à analyser
 * @returns Message d'erreur explicite ou null si valide
 */
export function getEmailValidationError(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return 'Email requis';
  }

  const trimmedEmail = email.trim();

  if (trimmedEmail.length < 3) {
    return 'Email trop court (minimum 3 caractères)';
  }

  if (trimmedEmail.length > 255) {
    return 'Email trop long (maximum 255 caractères)';
  }

  const atCount = (trimmedEmail.match(/@/g) || []).length;
  if (atCount === 0) {
    return 'Email doit contenir un @';
  }

  if (atCount > 1) {
    return 'Email ne peut contenir qu\'un seul @';
  }

  const [localPart, domain] = trimmedEmail.split('@');

  if (!localPart) {
    return 'Partie avant @ manquante';
  }

  if (!domain) {
    return 'Domaine après @ manquant';
  }

  if (!domain.includes('.')) {
    return 'Domaine doit contenir un point (ex: exemple.com)';
  }

  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];

  if (!tld || tld.length < 2) {
    return 'Extension de domaine invalide (ex: .com, .fr)';
  }

  if (domain.startsWith('.')) {
    return 'Domaine ne peut pas commencer par un point';
  }

  if (domain.endsWith('.')) {
    return 'Domaine ne peut pas finir par un point';
  }

  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return 'Email ne peut pas commencer ou finir par un point';
  }

  if (trimmedEmail.includes('..')) {
    return 'Email ne peut pas contenir deux points consécutifs';
  }

  if (!EMAIL_REGEX.test(trimmedEmail.toLowerCase())) {
    return 'Format d\'email invalide';
  }

  return null; // Email valide
}

/**
 * Exemples d'utilisation:
 *
 * isValidEmail('user@example.com') // true
 * isValidEmail('debu@') // false
 * isValidEmail('debute@email') // false
 * isValidEmail('test@.com') // false
 * isValidEmail('@example.com') // false
 * isValidEmail('user@domain') // false
 *
 * getEmailValidationError('debu@') // "Domaine après @ manquant"
 * getEmailValidationError('debute@email') // "Domaine doit contenir un point (ex: exemple.com)"
 * getEmailValidationError('user@example.com') // null (valide)
 */
