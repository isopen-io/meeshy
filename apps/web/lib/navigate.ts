/**
 * Thin navigation seam around `window.location`.
 *
 * Centralizing the imperative navigation calls behind named functions keeps
 * call sites readable and — crucially — lets tests observe navigation
 * intent without fighting jsdom's non-configurable `window.location`
 * (which cannot be spied on or reassigned reliably).
 *
 * These wrappers are deliberately trivial; do not add logic here.
 */

/** Replace the current history entry with `url` (no back-button entry). */
export function replaceLocation(url: string, loc: Pick<Location, 'replace'> = window.location): void {
  loc.replace(url);
}

/** Assign `url` to the current location (creates a back-button entry). */
export function assignLocation(url: string, loc: { href: string } = window.location): void {
  loc.href = url;
}
