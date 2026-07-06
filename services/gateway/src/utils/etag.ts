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

/** Strong ETag from an ALREADY-serialized body (the exact bytes on the wire). */
export function computeETagFromSerialized(body: string | Buffer): string {
  return `"${createHash('sha256').update(body).digest('hex')}"`;
}

/**
 * RFC 7232 §3.2 — does an `If-None-Match` request header match `etag`?
 * Handles a single value, a comma-separated list, the `*` wildcard, and the
 * array form Fastify may surface for repeated headers.
 *
 * `If-None-Match` is compared with the WEAK comparison function (RFC 7232 §3.2):
 * the `W/` weak-validator flag is ignored on BOTH sides — only the opaque-tag is
 * compared. This matters in production: `computeETag` emits a STRONG tag, but any
 * transforming intermediary (a CDN, or a gzip/br compressing proxy) is expected
 * to weaken it to `W/"…"` on the way back. Without weak comparison the client
 * then echoes `W/"…"`, an exact-string check fails, and every conditional GET
 * behind such a proxy re-sends the full 200 body instead of a 304 — silently
 * defeating the app-wide conditional-GET bandwidth optimization
 * (`conditionalGetOnSend`). Weak comparison is always correct here because every
 * caller uses this for `If-None-Match` on idempotent GETs.
 */
export function ifNoneMatchMatches(
  headerValue: string | string[] | undefined,
  etag: string
): boolean {
  if (headerValue === undefined) return false;
  const values = (Array.isArray(headerValue) ? headerValue : headerValue.split(','))
    .map((v) => v.trim());
  if (values.includes('*')) return true;
  const opaqueTag = (v: string): string => v.replace(/^W\//, '');
  const target = opaqueTag(etag);
  return values.some((v) => opaqueTag(v) === target);
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

/**
 * Pure gate for the app-wide conditional-GET `onSend` hook. Decides whether a
 * response is eligible for transparent ETag/304 handling. Conservative on
 * purpose — only safe, idempotent, body-carrying JSON reads:
 *   - GET only (never mutate-bearing verbs)
 *   - 200 only (errors/redirects/204/304 untouched)
 *   - skip when the route already set an ETag (per-route logic wins)
 *   - skip when the route opted into shared/long-lived caching (`max-age`
 *     without `no-cache`) — that response is already cacheable as-is
 *   - skip non-serialized payloads (streams, etc.)
 *   - JSON content-type only — never hash a binary/file/text download body
 */
export function shouldApplyConditionalGet(opts: {
  method: string;
  statusCode: number;
  hasETag: boolean;
  cacheControl?: string | string[];
  contentType?: string | string[];
  payloadType: 'string' | 'buffer' | 'other';
}): boolean {
  if (opts.method !== 'GET') return false;
  if (opts.statusCode !== 200) return false;
  if (opts.hasETag) return false;
  if (opts.payloadType === 'other') return false;
  // JSON API reads only. Excludes attachment/file downloads (image/*, video/*,
  // application/octet-stream, …) which may arrive as a 200 Buffer — we must not
  // hash a multi-MB media body on every request.
  const ct = Array.isArray(opts.contentType)
    ? opts.contentType.join(',')
    : opts.contentType ?? '';
  if (!/application\/(.*\+)?json/i.test(ct)) return false;
  const cc = Array.isArray(opts.cacheControl)
    ? opts.cacheControl.join(',')
    : opts.cacheControl ?? '';
  if (/max-age=\s*\d+/i.test(cc) && !/no-cache/i.test(cc)) return false;
  return true;
}

/**
 * App-wide Fastify `onSend` hook that transparently adds conditional-GET
 * (ETag + 304) to every eligible read response, so an unchanged GET costs a
 * header-only round trip instead of repatriating the full body. Generalizes the
 * per-route `sendWithETag` to the ~200 GET endpoints that never opted in,
 * without touching a single handler. Routes that already handle ETag or set
 * `max-age` are left untouched (see `shouldApplyConditionalGet`).
 */
export async function conditionalGetOnSend(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<unknown> {
  const payloadType: 'string' | 'buffer' | 'other' =
    typeof payload === 'string' ? 'string' : Buffer.isBuffer(payload) ? 'buffer' : 'other';

  if (
    !shouldApplyConditionalGet({
      method: request.method,
      statusCode: reply.statusCode,
      hasETag: reply.hasHeader('etag'),
      cacheControl: reply.getHeader('cache-control') as string | string[] | undefined,
      contentType: reply.getHeader('content-type') as string | string[] | undefined,
      payloadType,
    })
  ) {
    return payload;
  }

  const body = payloadType === 'buffer' ? (payload as Buffer) : Buffer.from(payload as string);
  const etag = computeETagFromSerialized(body);
  reply.header('ETag', etag);
  if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'private, no-cache');

  if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
    reply.code(304);
    return '';
  }
  return payload;
}
