/**
 * URL content helpers for the translation pipeline.
 *
 * A "URL-only" content carries no translatable text — it is purely HTTP(S)
 * link(s) plus whitespace. Such content must skip translation entirely: links
 * are preserved verbatim and never sent to NLLB (which would corrupt them).
 *
 * For mixed content (text + links), translation still runs; the translator
 * masks/restores the URLs (see services/translator translator_engine.mask_urls).
 */

// A URL token stops at the first character that cannot legally appear in a URL
// (RFC 3986 unreserved + reserved + percent). `\S+` would be greedy and absorb
// adjacent non-Latin text that carries no space separator (Chinese, Japanese,
// Thai…), wrongly classifying `https://x.com你好` as URL-only and skipping
// translation of the trailing text. Bounding the token to URL-legal characters
// leaves that text intact for the strip check.
//
// The `i` flag makes the scheme case-insensitive (RFC 3986 §3.1): mobile
// keyboards auto-capitalize the first letter of a message, so a bare link very
// commonly arrives as `Https://…`. Without `i`, that never matches and the link
// is (wrongly) sent to NLLB, which corrupts it — the exact failure this helper
// exists to prevent. The character class already lists `A-Za-z`, so `i` only
// affects the `https?` scheme literal.
const URL_TOKEN_REGEX = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

/**
 * Returns true when `text` contains only HTTP(S) URLs and whitespace
 * (i.e. nothing left to translate once links are stripped).
 */
export function isUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return trimmed.replace(URL_TOKEN_REGEX, '').trim().length === 0;
}
