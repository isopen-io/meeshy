import { createHash } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Strong ETag for a JSON list endpoint: the quoted SHA-256 hex of the
 * payload's canonical JSON. Stable by construction — identical data (same
 * conversation/message list, same computed fields) serializes to the same
 * string and therefore re-hashes to the same validator, so an unchanged list
 * yields the same ETag across requests. Because it hashes exactly the logical
 * payload (including request-time fields like unread counts / isOnline), a 304
 * can never serve stale data: any change to the response changes the ETag.
 */
export function computeETag(payload: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}"`;
}

/**
 * RFC 7232 §3.2 — does an `If-None-Match` request header match `etag`?
 * Handles a single value, a comma-separated list, the `*` wildcard, and the
 * array form Fastify may surface for repeated headers.
 */
export function ifNoneMatchMatches(
  headerValue: string | string[] | undefined,
  etag: string
): boolean {
  if (headerValue === undefined) return false;
  const values = (Array.isArray(headerValue) ? headerValue : headerValue.split(','))
    .map((v) => v.trim());
  return values.includes('*') || values.includes(etag);
}

/**
 * Conditional-GET handling for a read-heavy JSON list endpoint. Computes a
 * strong ETag from `payload`, sets `ETag` + `Cache-Control: private, no-cache`
 * (always revalidate — correct for collaborative data — but the 304 makes
 * revalidation a header-only round trip), and when the request's
 * `If-None-Match` matches, sends a body-less 304 and returns `true`. Returns
 * `false` when the caller should send its normal 200 `payload`.
 *
 * Keeping `no-cache` (not `max-age`) means the client never serves a stale
 * list without checking; the saving is purely the response body when nothing
 * changed — which is exactly "don't repatriate data unnecessarily".
 */
export function sendWithETag(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): boolean {
  const etag = computeETag(payload);
  reply.header('ETag', etag);
  reply.header('Cache-Control', 'private, no-cache');
  if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
    reply.code(304).send();
    return true;
  }
  return false;
}
