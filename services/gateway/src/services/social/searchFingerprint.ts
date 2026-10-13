import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';

/**
 * L'EMPREINTE d'une recherche (#10506, revue de conformité O3).
 *
 * Le texte saisi ne quitte jamais la route de recherche : il n'est ni rangé,
 * ni journalisé, ni renvoyé dans un événement. La route sert à la place un
 * `searchId` OPAQUE que le client recopie dans ses événements `discovery`.
 *
 * ## Pourquoi l'empreinte voyage CHIFFRÉE
 *
 * `empreinte = HMAC(clé d'empreinte, texte normalisé)` permet de compter les
 * recherches identiques sans connaître le texte. Servie EN CLAIR dans le
 * `searchId`, elle devenait un ORACLE : n'importe quel compte soumet des
 * requêtes candidates, lit leurs empreintes, et retrouve par dictionnaire
 * les recherches rangées. Le `searchId` est donc un SCELLÉ AES-256-GCM
 * `hex(iv ‖ empreinte chiffrée ‖ tag)` : l'iv est aléatoire (deux recherches
 * identiques ne partagent aucun fragment), le tag refuse toute altération, et
 * seule la passerelle l'ouvre, à l'ingestion.
 *
 * Deux clés, DÉRIVÉES par HKDF-SHA256 de `SEARCH_FINGERPRINT_SECRET` sous deux
 * libellés distincts : celle de l'empreinte et celle du scellé ne se
 * confondent jamais, et le secret brut ne sert à rien d'autre.
 *
 * Sans état côté passerelle : aucune correspondance requête ↔ compte n'est
 * gardée. L'empreinte est une donnée PSEUDONYMISÉE (art. 4(5) RGPD) — une
 * requête courte se retrouve par dictionnaire dès qu'on détient la clé : elle
 * n'est rangée QUE sur un événement d'un compte qui a consenti à l'analyse
 * (`eventPrivacy.ts`), jamais sur un événement sans acteur ni anonyme, et la
 * clé se TOURNE (une nouvelle clé rend les anciennes empreintes muettes et
 * les anciens `searchId` illisibles).
 */

type Env = Readonly<Record<string, string | undefined>>;

const ENV_VAR = 'SEARCH_FINGERPRINT_SECRET';
const MIN_LENGTH = 32;
const PROCESS_SECRET = randomBytes(32).toString('hex');
const IV_BYTES = 12;
const FINGERPRINT_BYTES = 16;
const TAG_BYTES = 16;
const SEARCH_ID = new RegExp(`^[0-9a-f]{${2 * (IV_BYTES + FINGERPRINT_BYTES + TAG_BYTES)}}$`);
const HKDF_SALT = 'meeshy:search-fingerprint';
const FINGERPRINT_KEY_INFO = 'meeshy:search-fingerprint:hmac-sha256:v1';
const SEALING_KEY_INFO = 'meeshy:search-id:aes-256-gcm:v1';
const SEALING_AAD = Buffer.from('meeshy:search-id:v1');

const isProductionOrStaging = (env: Env): boolean => {
  const normalized = (env.NODE_ENV ?? 'development').trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
};

/**
 * Le secret, fail-closed en production comme `READER_KEY_HMAC_SECRET` : absent
 * ou trop court ⇒ erreur. Les deux fonctions publiques ci-dessous la
 * convertissent en ABSENCE d'empreinte — une recherche ne casse jamais faute de
 * secret, elle part simplement sans `searchId`, et aucune empreinte n'est
 * calculée avec un secret de processus.
 */
export function searchFingerprintSecret(env: Env = process.env): string {
  const value = env[ENV_VAR];
  if (!isProductionOrStaging(env)) return value && value.length > 0 ? value : PROCESS_SECRET;
  if (!value || value.length < MIN_LENGTH) {
    throw new Error(
      `[SECURITY] ${ENV_VAR} must be set (>= ${MIN_LENGTH} characters) in production/staging. ` +
      'Generate with: openssl rand -hex 32',
    );
  }
  return value;
}

/** Normalisation : NFKC, minuscules, espaces réduits — deux saisies équivalentes ont la même empreinte. */
export const normalizeSearchQuery = (query: string): string =>
  query.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const derivedKey = (secret: string, info: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, info, 32));

const fingerprintOf = (secret: string, query: string): Buffer =>
  createHmac('sha256', derivedKey(secret, FINGERPRINT_KEY_INFO))
    .update(normalizeSearchQuery(query))
    .digest()
    .subarray(0, FINGERPRINT_BYTES);

const secretOrUndefined = (): string | undefined => {
  try {
    return searchFingerprintSecret();
  } catch {
    return undefined;
  }
};

/** Émet le `searchId` d'une recherche — le texte n'en sort pas, l'empreinte n'en sort que scellée. `undefined` sans secret valable. */
export function issueSearchId(query: string, secret: string | undefined = secretOrUndefined()): string | undefined {
  if (secret === undefined) return undefined;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derivedKey(secret, SEALING_KEY_INFO), iv);
  cipher.setAAD(SEALING_AAD);
  const sealed = Buffer.concat([cipher.update(fingerprintOf(secret, query)), cipher.final()]);
  return Buffer.concat([iv, sealed, cipher.getAuthTag()]).toString('hex');
}

export type ReadSearchId = { readonly nonce: string; readonly fingerprint: string };

/** Ouvre un `searchId` ; `undefined` s'il est forgé, altéré, d'un ancien format ou scellé d'une autre clé. */
export function readSearchId(searchId: string, secret: string | undefined = secretOrUndefined()): ReadSearchId | undefined {
  if (secret === undefined || !SEARCH_ID.test(searchId)) return undefined;
  const bytes = Buffer.from(searchId, 'hex');
  const iv = bytes.subarray(0, IV_BYTES);
  const sealed = bytes.subarray(IV_BYTES, IV_BYTES + FINGERPRINT_BYTES);
  const tag = bytes.subarray(IV_BYTES + FINGERPRINT_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', derivedKey(secret, SEALING_KEY_INFO), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(SEALING_AAD);
    decipher.setAuthTag(tag);
    const fingerprint = Buffer.concat([decipher.update(sealed), decipher.final()]);
    return { nonce: iv.toString('hex'), fingerprint: fingerprint.toString('hex') };
  } catch {
    return undefined;
  }
}
