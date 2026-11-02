import { nameMinLength, usernameMinLength } from '@meeshy/shared/types/api-schemas/auth';
import { visibleNameLength } from '@meeshy/shared/utils/visible-name-length';

/**
 * LES BORNES D'UNE IDENTITÉ SAISIE (#13825, directive porteur 2026-10-30) —
 * l'unique endroit du web où un formulaire apprend combien de caractères il
 * faut pour un prénom, un nom, un nom affiché ou un pseudo.
 *
 * Les deux bornes et la MESURE d'un nom sont celles de la passerelle, lues dans
 * `@meeshy/shared` : un nom compte ses graphèmes VISIBLES (`visibleNameLength`)
 * — « 😀😀 » vaut 2, « É » décomposé 1, une lettre suivie d'une marque de
 * direction 1. Le client ne refuse donc jamais ce que le serveur accepte.
 *
 * Une saisie se juge ROGNÉE. Un champ vide n'est jamais « trop court » : c'est
 * un champ ABSENT, que chaque écran sait déjà dire (requis, dérivé, ignoré).
 */
export const NAME_MIN_LENGTH = nameMinLength;

export const USERNAME_MIN_LENGTH = usernameMinLength;

const tooShort = (length: number, minimum: number): boolean => length > 0 && length < minimum;

export const isNameTooShort = (typed: string): boolean => tooShort(visibleNameLength(typed), NAME_MIN_LENGTH);

export const isNameLongEnough = (typed: string): boolean => visibleNameLength(typed) >= NAME_MIN_LENGTH;

export const isUsernameTooShort = (typed: string): boolean => tooShort(typed.trim().length, USERNAME_MIN_LENGTH);

export const isUsernameLongEnough = (typed: string): boolean => typed.trim().length >= USERNAME_MIN_LENGTH;

/** Ce que la passerelle garde d'un pseudo d'invité (`SecuritySanitizer.sanitizeUsername`). */
const SERVED_NICKNAME_CHARACTER = /[a-zA-Z0-9_.-]/gu;

/**
 * Le pseudo SAISI d'un invité se mesure sur la base que la passerelle en SERT
 * (`servedGuestNicknameViolation`) : « Al# » ou « Zoé » n'y gardent que deux
 * caractères. Blanc, il reste permis : la passerelle nomme alors l'invité.
 */
export const isGuestNicknameTooShort = (typed: string): boolean =>
  typed.trim() !== '' && (typed.trim().match(SERVED_NICKNAME_CHARACTER)?.length ?? 0) < USERNAME_MIN_LENGTH;
