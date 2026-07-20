import {
  computeETag,
  computeETagFromSerialized,
  ifNoneMatchMatches,
  shouldApplyConditionalGet,
} from '../etag';

describe('computeETagFromSerialized', () => {
  it('is a quoted sha-256 and stable for identical bytes', () => {
    const a = computeETagFromSerialized('{"a":1}');
    const b = computeETagFromSerialized(Buffer.from('{"a":1}'));
    expect(a).toMatch(/^"[0-9a-f]{64}"$/);
    expect(a).toBe(b);
  });

  it('differs when the body differs', () => {
    expect(computeETagFromSerialized('{"a":1}')).not.toBe(computeETagFromSerialized('{"a":2}'));
  });

  it('agrees with computeETag over the same JSON string', () => {
    const obj = { a: 1, b: [2, 3] };
    expect(computeETagFromSerialized(JSON.stringify(obj))).toBe(computeETag(obj));
  });
});

describe('ifNoneMatchMatches', () => {
  const etag = '"abc"';
  it.each([
    [undefined, false],
    ['"abc"', true],
    ['"x", "abc"', true],
    ['*', true],
    ['"nope"', false],
    [['"x"', '"abc"'], true],
    // RFC 7232 §3.2 — If-None-Match uses the WEAK comparison function: a client
    // (or proxy) that presents the strong tag weakened to `W/"abc"` still matches.
    ['W/"abc"', true],
    ['W/"x", W/"abc"', true],
    ['"x", W/"abc"', true],
    [['W/"x"', 'W/"abc"'], true],
    ['W/"nope"', false],
  ])('header %p → %p', (header, expected) => {
    expect(ifNoneMatchMatches(header as string | string[] | undefined, etag)).toBe(expected);
  });
});

describe('shouldApplyConditionalGet', () => {
  const base = {
    method: 'GET',
    statusCode: 200,
    hasETag: false,
    cacheControl: undefined as string | string[] | undefined,
    contentType: 'application/json; charset=utf-8' as string | string[] | undefined,
    payloadType: 'string' as const,
  };

  it('applies to a plain GET 200 JSON read', () => {
    expect(shouldApplyConditionalGet(base)).toBe(true);
    expect(shouldApplyConditionalGet({ ...base, payloadType: 'buffer' })).toBe(true);
  });

  it('skips non-JSON content types (file/media/text downloads)', () => {
    for (const contentType of ['image/webp', 'video/mp4', 'application/octet-stream', 'text/plain', undefined]) {
      expect(shouldApplyConditionalGet({ ...base, contentType })).toBe(false);
    }
  });

  it('applies to JSON variants (e.g. application/problem+json)', () => {
    expect(shouldApplyConditionalGet({ ...base, contentType: 'application/problem+json' })).toBe(true);
  });

  it('skips non-GET verbs', () => {
    expect(shouldApplyConditionalGet({ ...base, method: 'POST' })).toBe(false);
    expect(shouldApplyConditionalGet({ ...base, method: 'DELETE' })).toBe(false);
  });

  it('skips non-200 responses', () => {
    for (const statusCode of [201, 204, 301, 400, 404, 500]) {
      expect(shouldApplyConditionalGet({ ...base, statusCode })).toBe(false);
    }
  });

  it('skips when the route already set its own ETag', () => {
    expect(shouldApplyConditionalGet({ ...base, hasETag: true })).toBe(false);
  });

  it('skips non-serialized payloads (streams)', () => {
    expect(shouldApplyConditionalGet({ ...base, payloadType: 'other' })).toBe(false);
  });

  it('skips responses that opted into shared/long-lived caching', () => {
    expect(shouldApplyConditionalGet({ ...base, cacheControl: 'public, max-age=3600' })).toBe(false);
    expect(shouldApplyConditionalGet({ ...base, cacheControl: 'private, max-age=60' })).toBe(false);
  });

  it('STILL applies when max-age is paired with no-cache (revalidate)', () => {
    expect(shouldApplyConditionalGet({ ...base, cacheControl: 'no-cache, max-age=0' })).toBe(true);
  });

  it('applies when cache-control only has no-store/no-cache directives', () => {
    expect(shouldApplyConditionalGet({ ...base, cacheControl: 'private, no-cache' })).toBe(true);
  });
});
