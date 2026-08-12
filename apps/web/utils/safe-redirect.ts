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
 * URL parsing strips tab, LF and CR from anywhere in the input before
 * resolving it (WHATWG URL, "basic URL parser" — those code points are
 * removed, not rejected). A prefix check therefore inspects a different
 * string than the one the browser navigates to: `/\t/evil.example` looks
 * like a plain path here and reaches the network as `//evil.example`.
 *
 * The remaining C0 controls and DEL are refused with them: none of them
 * belong in a returnUrl unencoded, and refusing the whole range keeps this
 * guard from depending on which code points a given parser happens to drop.
 */
// eslint-disable-next-line no-control-regex
const STRIPPED_OR_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

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
 * Navigate to an attacker-suppliable external destination — new tab when the
 * browser allows it, same tab when the popup is blocked — but only once the
 * destination has been validated as a real http(s) URL.
 *
 * Both sinks matter and both were being fed unvalidated: the destination of a
 * tracking link is chosen by whoever created the link, i.e. another user, so a
 * `javascript:` destination reaching `window.open` or `location.href` executes
 * on OUR origin against the reader's session. The `/l/[token]` page already
 * guarded this; the in-message click handlers each open-coded the same
 * open-then-fallback dance without the guard. One helper so the check cannot
 * be forgotten by the next call site.
 *
 * Returns `false` when the destination was refused, so callers can fall back.
 */
export function openExternalUrl(raw: unknown): boolean {
  const target = safeExternalUrl(raw);
  if (!target) return false;

  const newWindow = window.open(target, '_blank', 'noopener,noreferrer');
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    window.location.href = target;
  }
  return true;
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
  // Reject before any prefix check: the checks below only mean something if
  // the string they inspect is the string the browser will resolve.
  if (STRIPPED_OR_CONTROL_CHARS.test(raw)) return fallback;
  // Must start with a single forward slash and never with `//` or `/\`.
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  // Reject any URL that parses with a scheme — these are absolute even
  // when concatenated to our origin.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
  return raw;
}
