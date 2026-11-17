/**
 * LE JETON DU PARTAGE SANS CONTACT (#19205) : `ce1.<aléa>.<offres>.<échéance>.<signature>`.
 *
 * - l'aléa (128 bits) est la seule clé du rangement côté serveur, qui sait seul qui l'a émis :
 *   le jeton ne porte ni identifiant, ni pseudo, ni numéro ;
 * - les offres et l'échéance voyagent EN CLAIR mais SIGNÉES : réécrire « vitrine » en « vitrine +
 *   demande d'ami » ou repousser l'échéance casse la signature ;
 * - la signature est un HMAC-SHA256 tronqué à 128 bits, sous une clé PROPRE à cet usage dérivée
 *   de `JWT_SECRET` (domaine séparé, comme `talkieAudioToken.ts`), comparée en temps constant.
 *
 * L'usage unique n'est pas ici : il est la prise atomique du service (`contactExchange.ts`).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  CONTACT_EXCHANGE_OFFERS,
  CONTACT_EXCHANGE_TOKEN_PATTERN,
  type ContactExchangeOffer,
} from '@meeshy/shared/types/contact-exchange';
import { getJwtSecret } from '../../utils/secrets';

const VERSION = 'ce1';
const SIGNATURE_BYTES = 16;

export type ContactExchangeClaims = {
  readonly nonce: string;
  readonly offers: readonly ContactExchangeOffer[];
  /** Secondes epoch. */
  readonly expiresAt: number;
};

const exchangeKey = (): Buffer => createHmac('sha256', getJwtSecret()).update('meeshy/contact-exchange/v1').digest();

const maskOf = (offers: readonly ContactExchangeOffer[]): number =>
  CONTACT_EXCHANGE_OFFERS.reduce((mask, offer, index) => (offers.includes(offer) ? mask | (1 << index) : mask), 0);

const offersOf = (mask: number): readonly ContactExchangeOffer[] =>
  CONTACT_EXCHANGE_OFFERS.filter((_, index) => (mask & (1 << index)) !== 0);

const signature = (body: string): string =>
  createHmac('sha256', exchangeKey()).update(body).digest().subarray(0, SIGNATURE_BYTES).toString('base64url');

export const newContactExchangeNonce = (): string => randomBytes(16).toString('base64url');

export function encodeContactExchangeToken(claims: ContactExchangeClaims): string {
  const body = `${VERSION}.${claims.nonce}.${maskOf(claims.offers)}.${claims.expiresAt}`;
  return `${body}.${signature(body)}`;
}

/** Les revendications d'un jeton bien formé, bien signé et non échu — sinon `null`, sans dire pourquoi. */
export function decodeContactExchangeToken(token: unknown, nowMs: number): ContactExchangeClaims | null {
  if (typeof token !== 'string' || !CONTACT_EXCHANGE_TOKEN_PATTERN.test(token)) return null;
  const [version, nonce, mask, expiresAt, given] = token.split('.');
  const expected = Buffer.from(signature(`${version}.${nonce}.${mask}.${expiresAt}`));
  const presented = Buffer.from(given);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;
  const expiry = Number(expiresAt);
  if (expiry * 1000 <= nowMs) return null;
  const offers = offersOf(Number(mask));
  return offers.length > 0 ? { nonce, offers, expiresAt: expiry } : null;
}
