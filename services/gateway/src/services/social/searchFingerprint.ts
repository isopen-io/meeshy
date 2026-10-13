import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * L'EMPREINTE d'une recherche (#10506, revue de conformité O3).
 *
 * Le texte saisi ne quitte jamais la route de recherche : il n'est ni rangé,
 * ni journalisé, ni renvoyé dans un événement. La route sert à la place un
 * `searchId` OPAQUE et SIGNÉ, `<nonce>.<empreinte>.<signature>` :
 *  - `nonce` relie la recherche aux clics sur ses résultats ;
 *  - `empreinte = HMAC-SHA256(SEARCH_FINGERPRINT_SECRET, texte normalisé)`
 *    permet de compter les recherches identiques sans connaître le texte ;
 *  - la signature empêche un client d'y glisser une empreinte forgée.
 *
 * Sans état côté passerelle : aucune correspondance requête ↔ compte n'est
 * gardée. L'empreinte est une donnée PSEUDONYMISÉE (art. 4(5) RGPD) — une
 * requête courte se retrouve par dictionnaire dès qu'on détient la clé : elle
 * n'est rangée QUE sur un événement d'un compte qui a consenti à l'analyse
 * (`eventPrivacy.ts`), jamais sur un événement sans acteur ni anonyme, et la
 * clé se TOURNE (une nouvelle clé rend les anciennes empreintes muettes).
 */

type Env = Readonly<Record<string, string | undefined>>;

const ENV_VAR = 'SEARCH_FINGERPRINT_SECRET';
const MIN_LENGTH = 32;
const PROCESS_SECRET = randomBytes(32).toString('hex');
const SEARCH_ID = /^([0-9a-f]{16})\.([0-9a-f]{32})\.([0-9a-f]{16})$/;

const isProductionOrStaging = (env: Env): boolean => {
  const normalized = (env.NODE_ENV ?? 'development').trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
};

/** Le secret, fail-closed en production comme `READER_KEY_HMAC_SECRET`. */
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

const hmac = (secret: string, value: string): string => createHmac('sha256', secret).update(value).digest('hex');

const signatureOf = (secret: string, nonce: string, fingerprint: string): string =>
  hmac(secret, `search-id:${nonce}.${fingerprint}`).slice(0, 16);

/** Émet le `searchId` d'une recherche — le texte n'en sort pas. */
export function issueSearchId(query: string, secret: string = searchFingerprintSecret()): string {
  const nonce = randomBytes(8).toString('hex');
  const fingerprint = hmac(secret, `search-query:${normalizeSearchQuery(query)}`).slice(0, 32);
  return `${nonce}.${fingerprint}.${signatureOf(secret, nonce, fingerprint)}`;
}

export type ReadSearchId = { readonly nonce: string; readonly fingerprint: string };

/** Relit un `searchId` ; `undefined` s'il est forgé, altéré ou signé d'une autre clé. */
export function readSearchId(searchId: string, secret: string = searchFingerprintSecret()): ReadSearchId | undefined {
  const match = SEARCH_ID.exec(searchId);
  if (!match) return undefined;
  const [, nonce, fingerprint, signature] = match;
  const expected = Buffer.from(signatureOf(secret, nonce, fingerprint));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { nonce, fingerprint } : undefined;
}
