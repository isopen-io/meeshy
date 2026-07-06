import { computeETag, ifNoneMatchMatches, sendWithETag } from '../../../utils/etag';

describe('computeETag', () => {
  it('is deterministic for identical payloads', () => {
    expect(computeETag({ data: [1, 2, 3], n: 'x' })).toBe(computeETag({ data: [1, 2, 3], n: 'x' }));
  });

  it('differs when the payload changes', () => {
    expect(computeETag({ data: [1] })).not.toBe(computeETag({ data: [2] }));
  });

  it('returns a quoted strong sha-256 validator', () => {
    expect(computeETag({})).toMatch(/^"[0-9a-f]{64}"$/);
  });
});

describe('ifNoneMatchMatches', () => {
  const etag = '"abc"';

  it('is false when the header is absent', () => {
    expect(ifNoneMatchMatches(undefined, etag)).toBe(false);
  });

  it('is true on an exact match', () => {
    expect(ifNoneMatchMatches('"abc"', etag)).toBe(true);
  });

  it('is false on a mismatch', () => {
    expect(ifNoneMatchMatches('"def"', etag)).toBe(false);
  });

  it('is true on the * wildcard', () => {
    expect(ifNoneMatchMatches('*', etag)).toBe(true);
  });

  it('is true when present in a comma-separated list', () => {
    expect(ifNoneMatchMatches('"x", "abc"', etag)).toBe(true);
  });

  it('is true when present in the array (repeated-header) form', () => {
    expect(ifNoneMatchMatches(['"x"', '"abc"'], etag)).toBe(true);
  });

  it('is true when the client weakens the strong tag (RFC 7232 §3.2 weak comparison)', () => {
    expect(ifNoneMatchMatches('W/"abc"', etag)).toBe(true);
  });

  it('is true when a weak-tagged value appears in a list', () => {
    expect(ifNoneMatchMatches('"x", W/"abc"', etag)).toBe(true);
  });

  it('is false when a weak-tagged value does not match', () => {
    expect(ifNoneMatchMatches('W/"def"', etag)).toBe(false);
  });
});

describe('sendWithETag', () => {
  function makeReply() {
    const headers: Record<string, string> = {};
    const state = { statusCode: 200, sent: false };
    const reply = {
      header(key: string, value: string) { headers[key] = value; return reply; },
      code(c: number) { state.statusCode = c; return reply; },
      send() { state.sent = true; return reply; },
      _headers: headers,
      _state: state,
    };
    return reply;
  }
  function makeRequest(ifNoneMatch?: string) {
    return { headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch } } as any;
  }

  it('sets ETag + Cache-Control and returns false (caller sends 200) when there is no If-None-Match', () => {
    const reply = makeReply();
    const handled = sendWithETag(makeRequest(), reply as any, { data: [1] });
    expect(handled).toBe(false);
    expect(reply._headers['ETag']).toMatch(/^"[0-9a-f]{64}"$/);
    expect(reply._headers['Cache-Control']).toBe('private, no-cache');
    expect(reply._state.sent).toBe(false);
  });

  it('sends a body-less 304 (returns true) when If-None-Match matches the current ETag', () => {
    const payload = { data: [1, 2, 3] };
    const etag = computeETag(payload);
    const reply = makeReply();
    const handled = sendWithETag(makeRequest(etag), reply as any, payload);
    expect(handled).toBe(true);
    expect(reply._state.statusCode).toBe(304);
    expect(reply._state.sent).toBe(true);
    expect(reply._headers['ETag']).toBe(etag);
  });

  it('returns false (caller sends 200) when If-None-Match is a stale ETag', () => {
    const reply = makeReply();
    const handled = sendWithETag(makeRequest('"stale"'), reply as any, { data: [9] });
    expect(handled).toBe(false);
    expect(reply._state.sent).toBe(false);
  });
});
