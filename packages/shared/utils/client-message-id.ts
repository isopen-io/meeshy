/**
 * Centralised helper for generating and validating `clientMessageId` values.
 *
 * Format: `cid_<UUID v4 lowercase>` — the `cid_` prefix differentiates from
 * MongoDB ObjectIds (24 hex chars) and from any legacy temp/offline/retry ids.
 *
 * Mirror of `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`
 * — both must produce values that match the same regex so the gateway
 * `(conversationId, clientMessageId)` dedup contract is honoured end-to-end.
 *
 * The `randomUUID()` implementation in Node and modern browsers produces
 * lowercase hex by default, so no `.toLowerCase()` is needed here. The
 * Swift counterpart MUST call `.lowercased()` because `UUID().uuidString`
 * is uppercase by default.
 */
import { randomUUID } from 'crypto';

export function generateClientMessageId(): string {
  return `cid_${randomUUID()}`;
}

export const CLIENT_MESSAGE_ID_REGEX =
  /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isValidClientMessageId(value: string): boolean {
  return CLIENT_MESSAGE_ID_REGEX.test(value);
}
