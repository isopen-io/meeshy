/**
 * Tests for the SSOT JWT helpers (utils/jwt).
 *
 * The crown-jewel regressions are the **base64url** cases: a JWT payload
 * segment containing `-` / `_` must decode correctly. The previous ad-hoc
 * implementations (websocket-diagnostics, auth-manager) used a naive
 * `atob(token.split('.')[1])` which throws `InvalidCharacterError` on such
 * tokens, misclassifying a valid, non-expired token as unreadable/expired.
 */

import { decodeJwtPayload, isValidJWTFormat, isJWTExpired } from '../../utils/jwt';

// Build a JWT-like string from a payload object using standard base64url
// (`+`→`-`, `/`→`_`, no padding) — exactly how real JWT libraries encode.
const toBase64Url = (obj: Record<string, unknown>): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const makeJWT = (payload: Record<string, unknown>): string =>
  `eyJhbGciOiJIUzI1NiJ9.${toBase64Url(payload)}.Zm9vYmFy`;

// A token whose payload segment deterministically contains BOTH `-` and `_`
// (from the JSON string value ">?>?"). `atob` on the raw segment throws.
const URL_SAFE_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI-Pz4_Iiwicm9sZSI6Im1lbWJlciIsImV4cCI6OTk5OTk5OTk5OX0.Zm9vYmFy';

describe('decodeJwtPayload', () => {
  it('decodes a standard payload', () => {
    const token = makeJWT({ sub: 'user-1', exp: 9999 });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'user-1', exp: 9999 });
  });

  it('decodes a base64url payload containing - and _ (regression)', () => {
    expect(decodeJwtPayload(URL_SAFE_TOKEN)).toEqual({
      sub: '>?>?',
      role: 'member',
      exp: 9999999999,
    });
  });

  it('returns null for a token that is not 3 segments', () => {
    expect(decodeJwtPayload('header.payload')).toBeNull();
    expect(decodeJwtPayload('header-only')).toBeNull();
    expect(decodeJwtPayload('a.b.c.d')).toBeNull();
  });

  it('returns null for an empty payload segment', () => {
    expect(decodeJwtPayload('header..signature')).toBeNull();
  });

  it('returns null for undecodable / non-JSON payloads', () => {
    expect(decodeJwtPayload('h.!!!invalid!!!.s')).toBeNull();
  });

  it('returns null for a JSON payload that is not an object', () => {
    const token = `header.${btoa('42')}.sig`;
    expect(decodeJwtPayload(token)).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload(null as unknown as string)).toBeNull();
    expect(decodeJwtPayload(undefined as unknown as string)).toBeNull();
  });
});

describe('isValidJWTFormat', () => {
  it('accepts a well-formed token', () => {
    expect(isValidJWTFormat(makeJWT({ sub: 'x' }))).toBe(true);
  });

  it('accepts a token with URL-safe base64 characters', () => {
    expect(isValidJWTFormat(URL_SAFE_TOKEN)).toBe(true);
  });

  it('rejects empty / non-string input', () => {
    expect(isValidJWTFormat('')).toBe(false);
    expect(isValidJWTFormat(null as unknown as string)).toBe(false);
    expect(isValidJWTFormat(123 as unknown as string)).toBe(false);
  });

  it('rejects a wrong number of segments', () => {
    expect(isValidJWTFormat('part1.part2')).toBe(false);
    expect(isValidJWTFormat('part1.part2.part3.part4')).toBe(false);
  });

  it('rejects empty segments', () => {
    expect(isValidJWTFormat('...')).toBe(false);
  });

  it('rejects invalid base64 characters', () => {
    expect(isValidJWTFormat('invalid!!!.base64@@@.characters###')).toBe(false);
  });
});

describe('isJWTExpired', () => {
  it('treats a token whose exp is in the past as expired', () => {
    const token = makeJWT({ sub: 'x', exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(isJWTExpired(token)).toBe(true);
  });

  it('treats a token whose exp is in the future as not expired', () => {
    const token = makeJWT({ sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isJWTExpired(token)).toBe(false);
  });

  it('does NOT report a valid future token with base64url payload as expired (regression)', () => {
    // URL_SAFE_TOKEN has exp = 9999999999 (year 2286). The old naive atob threw
    // → the diagnostics helper reported this valid token as expired.
    expect(isJWTExpired(URL_SAFE_TOKEN)).toBe(false);
  });

  it('treats a token without an exp claim as not expired', () => {
    expect(isJWTExpired(makeJWT({ sub: 'x' }))).toBe(false);
  });

  it('treats a malformed token as expired', () => {
    expect(isJWTExpired('not-a-jwt')).toBe(true);
    expect(isJWTExpired('')).toBe(true);
  });

  it('applies a 30s grace margin after expiry', () => {
    const justExpired = Math.floor(Date.now() / 1000) - 5;
    expect(isJWTExpired(makeJWT({ exp: justExpired }))).toBe(false);
  });
});
