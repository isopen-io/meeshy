/**
 * SSOT — décodage d'un payload JWT côté client (inspection uniquement, PAS de
 * vérification de signature).
 *
 * Les segments d'un JWT sont encodés en **base64url** : ils peuvent contenir
 * `-` et `_`, qui ne sont pas des caractères base64 standard. Décoder sans les
 * normaliser vers `+`/`/` fait lever `InvalidCharacterError` à `atob` pour tout
 * token dont le payload contient l'un de ces caractères — un token valide est
 * alors faussement classé comme illisible/expiré. Ce module centralise la seule
 * implémentation correcte, consommée par `utils/auth`, `websocket-diagnostics`
 * et `services/auth-manager`.
 */

const EXPIRY_MARGIN_MS = 30_000;

const fromBase64Url = (segment: string): string =>
  atob(segment.replace(/-/g, '+').replace(/_/g, '/'));

/**
 * Décode le payload d'un JWT (2ᵉ segment) en objet. Retourne `null` si le token
 * est absent, malformé (≠ 3 segments), non décodable, ou si le payload n'est pas
 * un objet JSON.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(parts[1]));
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Valide le format d'un token JWT (3 segments base64url non vides et décodables).
 */
export function isValidJWTFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    parts.forEach(part => {
      if (!part || part.length === 0) throw new Error('Empty part');
      fromBase64Url(part);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie si un token JWT est expiré (avec une marge de grâce de 30s après
 * l'expiration). Un token illisible/malformé est considéré comme expiré ; un
 * token sans `exp` numérique est considéré comme non expiré.
 */
export function isJWTExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;

  const exp = payload.exp;
  if (!exp || typeof exp !== 'number') return false;

  return exp * 1000 < Date.now() - EXPIRY_MARGIN_MS;
}
