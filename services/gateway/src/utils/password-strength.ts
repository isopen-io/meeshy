/**
 * L'évaluation de robustesse d'un mot de passe — UNE règle, pour tous les
 * sites qui en acceptent un (#3629).
 *
 * Avant ce fichier, `zxcvbn` n'était appelé qu'à UN endroit —
 * `PasswordResetService.validatePasswordStrength`, une méthode privée
 * consultée par le seul flux `/forgot-password` → complétion du reset.
 * L'inscription, le changement de mot de passe authentifié et les deux
 * gestes admin (création, réinitialisation) ne validaient que la LONGUEUR
 * (`PASSWORD_MIN_LENGTH`, via Zod) : un mot de passe de douze `a` passait
 * partout sauf au reset.
 *
 * Extrait ici pour que les cinq portes appellent la MÊME fonction plutôt que
 * de retaper — ou de ne jamais retaper — le même jugement.
 */
import zxcvbn from 'zxcvbn';
import { PASSWORD_MIN_LENGTH } from '@meeshy/shared/utils/validation';

/** Score zxcvbn minimal accepté (0-4). */
export const MIN_PASSWORD_SCORE = 3;

export interface PasswordStrengthResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Longueur + classes de caractères + score `zxcvbn` — les mêmes règles que
 * portait `PasswordResetService` avant l'extraction, inchangées : ce lot
 * généralise leur PORTÉE, il ne change pas leur SÉVÉRITÉ.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`minimum ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push('one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('one digit');
  }

  const result = zxcvbn(password);
  if (result.score < MIN_PASSWORD_SCORE) {
    errors.push(`password strength score is ${result.score}/4 (minimum: ${MIN_PASSWORD_SCORE}/4)`);
    if (result.feedback.warning) {
      errors.push(result.feedback.warning);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
