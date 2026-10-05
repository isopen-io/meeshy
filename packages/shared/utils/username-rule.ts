/**
 * LE VERDICT D'UN PSEUDO, tel que la passerelle le rendra (#8082).
 *
 * Les bornes et le motif vivent dans `types/api-schemas/auth.ts`
 * (`usernameMinLength`, `usernameMaxLength`, `usernamePatternSource`) — le
 * schéma Ajv de `POST /auth/register` les sert tels quels. Ce module ne
 * recopie rien : il les lit, pour qu'un écran refuse PENDANT la saisie ce que
 * le serveur refuserait à l'envoi, et dise pourquoi.
 *
 * Le refus est MOTIVÉ (même forme que `phone-plausibility.ts`) : « pseudo
 * invalide » n'apprend rien à qui a tapé un caractère de trop.
 *
 * Miroir Swift : `SignupForm.usernameRefusal` (`packages/MeeshySDK/Sources/MeeshyUI/Auth/SignupForm.swift`).
 */

import { usernameMaxLength, usernameMinLength, usernamePatternSource } from '../types/api-schemas/auth.js';

export type UsernameRefusal = 'too-short' | 'too-long' | 'invalid-characters';

const USERNAME_PATTERN = new RegExp(usernamePatternSource);

/**
 * `null` quand le pseudo est recevable. La LONGUEUR se juge avant les
 * caractères : c'est ce que le compteur du champ montre, et le premier défaut
 * à corriger. Ajv compte en unités UTF-16 comme `.length`.
 */
export function usernameRefusal(value: string): UsernameRefusal | null {
  if (value.length < usernameMinLength) return 'too-short';
  if (value.length > usernameMaxLength) return 'too-long';
  if (!USERNAME_PATTERN.test(value)) return 'invalid-characters';
  return null;
}

export function isUsernameAcceptable(value: string): boolean {
  return usernameRefusal(value) === null;
}
