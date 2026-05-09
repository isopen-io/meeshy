/**
 * Browser-safe wrapper around the shared `clientMessageId` helper.
 *
 * The shared module at `packages/shared/utils/client-message-id.ts` imports
 * `randomUUID` from Node's `crypto` module — that import path is not resolved
 * by Webpack/Next.js for browser bundles. Re-exporting from there would break
 * the client build, so this file mirrors the same contract using the Web
 * Crypto API (`globalThis.crypto.randomUUID()`), which is available in every
 * runtime the web app actually targets (modern browsers, Node 19+ for SSR).
 *
 * Source of truth for the format / regex: `packages/shared/utils/client-message-id.ts`.
 * Source of truth for the iOS counterpart: `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`.
 *
 * Format: `cid_<UUID v4 lowercase>` — the `cid_` prefix differentiates from
 * MongoDB ObjectIds (24 hex chars) and from any legacy temp/offline/retry ids.
 * The gateway uses `(conversationId, clientMessageId)` as the dedup key for
 * the offline queue, so any drift from the regex below silently breaks dedup.
 */

/**
 * Regex mirror of `CLIENT_MESSAGE_ID_REGEX` from
 * `packages/shared/utils/client-message-id.ts`. Must stay byte-identical.
 */
export const CLIENT_MESSAGE_ID_REGEX =
  /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Generate a fresh `clientMessageId` for an outgoing message.
 *
 * Uses `globalThis.crypto.randomUUID()` when available (modern browsers and
 * Node 19+), and falls back to a manual v4 UUID built from
 * `crypto.getRandomValues` for older runtimes (unlikely in practice but keeps
 * the helper safe to import from anywhere in the bundle).
 */
export function generateClientMessageId(): string {
  return `cid_${randomUuidV4()}`;
}

/**
 * Validate a `clientMessageId` against the shared format. Mostly useful in
 * tests and dev-time assertions.
 */
export function isValidClientMessageId(value: string): boolean {
  return CLIENT_MESSAGE_ID_REGEX.test(value);
}

function randomUuidV4(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;

  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoRef.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  throw new Error('No secure random source available for generateClientMessageId');
}
