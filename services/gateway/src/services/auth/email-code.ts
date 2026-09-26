/**
 * La paire « code à six chiffres + lien » envoyée par e-mail, et sa preuve
 * (#8033).
 *
 * Depuis #8033 cette paire n'atteste plus seulement une adresse : présentée à
 * `POST /auth/verify-email`, elle OUVRE une session. Elle devient donc un
 * secret de connexion, et se garde comme tel :
 *
 * - le code est stocké HACHÉ (SHA-256), comme le jeton du lien l'était déjà.
 *   Un code en clair dans `User.emailVerificationCode` se lisait depuis toute
 *   sauvegarde de la base, et donnait la session ;
 * - la comparaison est en TEMPS CONSTANT (`timingSafeEqual`), jamais un
 *   `where: { emailVerificationCode: saisie }` qui laisserait la base
 *   comparer ;
 * - un code écrit EN CLAIR avant ce lot (six chiffres) reste reconnu jusqu'à
 *   son expiration, comparé lui aussi en temps constant : les e-mails déjà
 *   partis ne deviennent pas des impasses.
 *
 * Une seule paire vit à la fois par compte — la plus récente : l'émettre
 * remplace la précédente, que ce soit une vérification ou une connexion.
 *
 * @module services/auth/email-code
 */

import crypto from 'crypto';
import { generateNumericCode } from '../../utils/verification-code';

/** Durée de vie d'une paire émise pour une CONNEXION (porte « e-mail seul »). */
export const LOGIN_CODE_TTL_MINUTES = 15;

/** Durée de vie d'une paire de VÉRIFICATION d'adresse (inscription), en minutes. */
export const verificationTtlMinutes = (): number =>
  Math.round(parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400', 10) / 60);

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const SHA256_HEX_LENGTH = 64;

/** La forme stockée d'un code — jamais le code lui-même. */
export const hashEmailCode = (code: string): string => sha256(code);

/** La forme stockée d'un jeton de lien. */
export const hashEmailToken = (token: string): string => sha256(token);

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Le code saisi correspond-il à ce qui est stocké ?
 *
 * Stocké haché (64 caractères hexadécimaux) : on compare les empreintes.
 * Stocké en clair (héritage d'avant #8033) : on compare les chiffres. Dans les
 * deux cas en temps constant, et `false` sur tout stockage vide.
 */
export function emailCodeMatches(stored: string | null | undefined, input: string): boolean {
  if (typeof stored !== 'string' || stored.length === 0 || input.length === 0) return false;
  if (stored.length === SHA256_HEX_LENGTH) return constantTimeEquals(stored, hashEmailCode(input));
  return constantTimeEquals(stored, input);
}

/** Le jeton du lien correspond-il à l'empreinte stockée ? */
export function emailTokenMatches(stored: string | null | undefined, input: string): boolean {
  if (typeof stored !== 'string' || stored.length === 0 || input.length === 0) return false;
  return constantTimeEquals(stored, hashEmailToken(input));
}

export type EmailCodePair = {
  /** À envoyer : le jeton brut du lien et le code en clair. */
  readonly rawToken: string;
  readonly code: string;
  readonly expiresAt: Date;
  /** À écrire sur la ligne `User` : les seules empreintes. */
  readonly columns: {
    readonly emailVerificationToken: string;
    readonly emailVerificationCode: string;
    readonly emailVerificationExpiry: Date;
  };
};

/** Composer une paire neuve, valable `ttlMinutes`. */
export function mintEmailCodePair(ttlMinutes: number, now: Date = new Date()): EmailCodePair {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const code = generateNumericCode(6);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  return {
    rawToken,
    code,
    expiresAt,
    columns: {
      emailVerificationToken: hashEmailToken(rawToken),
      emailVerificationCode: hashEmailCode(code),
      emailVerificationExpiry: expiresAt,
    },
  };
}

/** Le lien que l'e-mail porte — `${FRONTEND_URL}/auth/verify-email?token=…&email=…`. */
export function emailCodeLink(frontendUrl: string, rawToken: string, email: string): string {
  return `${frontendUrl}/auth/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}`;
}
