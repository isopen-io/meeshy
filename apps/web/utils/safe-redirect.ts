/**
 * Safe redirect helpers — block open-redirect vulnerabilities.
 *
 * Two distinct hazards on the web app:
 *
 * 1. External tracking redirects (`/l/[token]`): the originalUrl returned by
 *    the gateway is an arbitrary HTTP(S) URL chosen by the link owner. We
 *    must allow http/https but reject `javascript:`, `data:`, `file:`, and
 *    custom schemes — those are XSS / phishing vectors.
 *
 * 2. Internal returnUrl plumbing (magic-link, login redirects): the value
 *    arrives from a query parameter under attacker control. Anything that
 *    leaves our origin must be rejected so a phisher cannot craft
 *    `?returnUrl=https://attacker.example` and have the user land there
 *    after authenticating.
 */

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validate an external (cross-origin) destination URL. Returns the URL
 * verbatim if it parses as a valid http/https URL, `null` otherwise.
 *
 * Use this for tracking redirects (`/l/[token]`) where the destination is
 * legitimately off-origin but must still be a real web URL.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = new URL(raw);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validate an internal-only destination path. Accepts a same-origin
 * pathname (`/anything`) and rejects anything that could leave our
 * origin: absolute URLs, protocol-relative URLs (`//evil.com`), schemes
 * (`javascript:`), and backslash-prefixed paths (which IE / some
 * crawlers treat as protocol-relative).
 *
 * Returns the input string when safe, or the supplied fallback otherwise.
 *
 * Use this for any returnUrl / redirect parameter pulled from query
 * strings during auth flows.
 */
export function safeInternalPath(raw: unknown, fallback: string = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  // Must start with a single forward slash and never with `//` or `/\`.
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  // Reject any URL that parses with a scheme — these are absolute even
  // when concatenated to our origin.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
  return raw;
}
