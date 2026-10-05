/**
 * Chiffrement AU REPOS d'un secret de configuration (clé d'API d'un
 * fournisseur, par exemple) avant son écriture en base.
 *
 * - AES-256-GCM, nonce aléatoire de 12 octets, étiquette de 16 octets ;
 * - format versionné `v1:<base64 nonce>:<base64 tag>:<base64 chiffré>` ;
 * - un `context` (ex. `AgentLlmConfig.apiKey`) est lié comme données
 *   authentifiées : une valeur scellée pour une colonne ne s'ouvre pas pour
 *   une autre ;
 * - la clé (32 octets, base64) vient de `SECRETS_AT_REST_KEY`, DÉDIÉE : elle
 *   n'est pas la clé maîtresse des conversations (`ENCRYPTION_MASTER_KEY`) ni
 *   celle des pièces jointes (`ATTACHMENT_MASTER_KEY`).
 *
 * Fail-closed : sans clé, `sealSecret` LÈVE — l'appelant refuse l'écriture
 * plutôt que de stocker le clair. Seuls `NODE_ENV=development` et
 * `NODE_ENV=test` (au mot près, casse et espaces ignorés) tolèrent le clair,
 * avec un avertissement journalisé ; toute autre valeur, l'absence comprise,
 * est traitée comme un environnement servi (même règle que
 * `config/cors-origins.ts` : se tromper vers « servi » ne coûte qu'une variable
 * à poser).
 *
 * La clé doit être du base64 STRICT de 32 octets (`openssl rand -base64 32`),
 * non nulle ; un message d'erreur ne cite jamais sa valeur.
 *
 * Rétrocompatibilité : une valeur sans préfixe `v1:` est une valeur écrite
 * avant ce module ; `openSecret` la rend telle quelle.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from './logger';

export const SECRETS_AT_REST_KEY_ENV = 'SECRETS_AT_REST_KEY';

const VERSION = 'v1';
const PREFIX = `${VERSION}:`;
const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HINT_CHARS = 4;
/** En dessous, les 4 derniers caractères en diraient trop. */
export const HINT_MIN_LENGTH = 20;
/** 32 octets en base64 standard : 43 caractères + un `=` de remplissage. */
const KEY_SHAPE = /^[A-Za-z0-9+/]{43}=$/;
/** Les seuls environnements où un secret peut rester en clair, faute de clé. */
const PLAINTEXT_TOLERATED_ENVS: ReadonlySet<string> = new Set(['development', 'test']);

export class SecretAtRestUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretAtRestUnavailableError';
  }
}

const plaintextTolerated = (): boolean =>
  PLAINTEXT_TOLERATED_ENVS.has((process.env.NODE_ENV ?? '').trim().toLowerCase());

const INVALID_KEY_MESSAGE =
  `${SECRETS_AT_REST_KEY_ENV} must be ${KEY_BYTES} non-zero bytes, strict base64 encoded (generate with: openssl rand -base64 32)`;

/** La clé, ou `null` si la variable est absente. Une clé MALFORMÉE lève. */
function readKey(): Buffer | null {
  const raw = process.env[SECRETS_AT_REST_KEY_ENV]?.trim();
  if (!raw) return null;
  if (!KEY_SHAPE.test(raw)) throw new SecretAtRestUnavailableError(INVALID_KEY_MESSAGE);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES || key.every((byte) => byte === 0)) {
    throw new SecretAtRestUnavailableError(INVALID_KEY_MESSAGE);
  }
  return key;
}

/** Vrai quand la clé est posée ET valide ; ne lève jamais. */
export function hasValidSecretsKey(): boolean {
  try {
    return readKey() !== null;
  } catch {
    return false;
  }
}

/** Contextes déjà signalés : un avertissement par processus et par contexte. */
const undecryptableReported = new Set<string>();

function reportUndecryptable(context: string): void {
  if (undecryptableReported.has(context)) return;
  undecryptableReported.add(context);
  logger.warn(`[secret-at-rest] une valeur scellée ne se déchiffre pas avec la clé courante (contexte : ${context})`);
}

export const isSealedSecret = (stored: string): boolean => stored.startsWith(PREFIX);

/** Vrai quand un secret peut être scellé dans cet environnement. */
export function canSealSecrets(): boolean {
  return hasValidSecretsKey();
}

export function sealSecret(plain: string, context: string): string {
  const key = readKey();
  if (!key) {
    if (!plaintextTolerated()) {
      throw new SecretAtRestUnavailableError(
        `${SECRETS_AT_REST_KEY_ENV} is required to store a secret outside development/test`,
      );
    }
    logger.warn(`[secret-at-rest] ${SECRETS_AT_REST_KEY_ENV} not set — secret stored unencrypted (development/test only)`);
    return plain;
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function openSecret(stored: string, context: string): string {
  if (!isSealedSecret(stored)) return stored;
  const key = readKey();
  if (!key) {
    throw new SecretAtRestUnavailableError(`${SECRETS_AT_REST_KEY_ENV} is required to read a stored secret`);
  }
  const parts = stored.split(':');
  if (parts.length !== 4) throw new Error('Malformed sealed secret');
  const nonce = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed sealed secret');
  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (error) {
    reportUndecryptable(context);
    throw error;
  }
}

/**
 * Les 4 derniers caractères du secret, pour que l'administrateur reconnaisse
 * la clé en place. Ne jette jamais : une valeur illisible, vide ou trop courte
 * donne `null`.
 */
export function secretHint(stored: string | null | undefined, context: string): string | null {
  if (!stored) return null;
  try {
    const plain = openSecret(stored, context);
    return plain.length >= HINT_MIN_LENGTH ? plain.slice(-HINT_CHARS) : null;
  } catch {
    return null;
  }
}
