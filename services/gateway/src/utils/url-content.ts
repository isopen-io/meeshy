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

const URL_TOKEN_REGEX = /https?:\/\/\S+/g;

/**
 * Returns true when `text` contains only HTTP(S) URLs and whitespace
 * (i.e. nothing left to translate once links are stripped).
 */
export function isUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return trimmed.replace(URL_TOKEN_REGEX, '').trim().length === 0;
}
