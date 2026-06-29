/**
 * AgentHttpClient Unit Tests
 *
 * Covers:
 * - AgentUnavailableError: name, instanceof checks
 * - request(): success path — returns body.data
 * - request(): non-ok response — throws Error with statusCode
 * - request(): TypeError from fetch → AgentUnavailableError
 * - request(): AbortError DOMException → AgentUnavailableError
 * - request(): other errors propagate as-is
 * - request(): default 5 s timeout; custom timeout via timeoutMs
 * - getQueue(): correct URL with/without conversationId
 * - deleteQueueItem(): DELETE method with encoded id
 * - editQueueItem(): PATCH method with body
 * - stopScan(): POST with no body
 * - invalidateCache(): POST with 1500 ms timeout
 *
 * @jest-environment node
 */

import { AgentHttpClient, AgentUnavailableError } from '../../../services/AgentHttpClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ success: true, data }),
  });
}

function mockFetchError(status: number, message = 'Something went wrong') {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ success: false, message }),
  });
}

const BASE_URL = 'http://agent.internal';

describe('AgentUnavailableError', () => {
  it('is an Error subclass', () => {
    const err = new AgentUnavailableError('unreachable');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name AgentUnavailableError', () => {
    const err = new AgentUnavailableError('unreachable');
    expect(err.name).toBe('AgentUnavailableError');
  });

  it('carries the provided message', () => {
    const err = new AgentUnavailableError('Agent service is unreachable');
    expect(err.message).toBe('Agent service is unreachable');
  });
});

describe('AgentHttpClient', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------
  describe('success path', () => {
    it('returns body.data on a successful response', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([{ id: '1' }]) as any);
      const client = new AgentHttpClient(BASE_URL);

      const result = await client.getQueue();

      expect(result).toEqual([{ id: '1' }]);
    });

    it('calls fetch with Content-Type: application/json header', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([]) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.getQueue();

      const [, opts] = (fetchSpy.mock.calls[0] as [string, RequestInit]);
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('clears the timeout after a successful call', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([]) as any);
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      const client = new AgentHttpClient(BASE_URL);

      await client.getQueue();

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Error responses
  // -------------------------------------------------------------------------
  describe('non-ok responses', () => {
    it('throws an Error when the server returns a non-ok status', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchError(500, 'Internal error') as any);
      const client = new AgentHttpClient(BASE_URL);

      await expect(client.getQueue()).rejects.toThrow('Internal error');
    });

    it('attaches statusCode to the thrown error', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchError(404) as any);
      const client = new AgentHttpClient(BASE_URL);

      try {
        await client.getQueue();
        fail('Expected error');
      } catch (err) {
        expect((err as Error & { statusCode: number }).statusCode).toBe(404);
      }
    });

    it('uses generic message when body.message is absent', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        jest.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: jest.fn().mockResolvedValue({ success: false }),
        }) as any
      );
      const client = new AgentHttpClient(BASE_URL);

      await expect(client.getQueue()).rejects.toThrow('Agent responded with 503');
    });
  });

  // -------------------------------------------------------------------------
  // AgentUnavailableError cases
  // -------------------------------------------------------------------------
  describe('network failure → AgentUnavailableError', () => {
    it('wraps TypeError (network failure) in AgentUnavailableError', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const client = new AgentHttpClient(BASE_URL);

      await expect(client.getQueue()).rejects.toBeInstanceOf(AgentUnavailableError);
    });

    it('wraps DOMException AbortError in AgentUnavailableError', async () => {
      const abortErr = new DOMException('The operation was aborted', 'AbortError');
      fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(abortErr);
      const client = new AgentHttpClient(BASE_URL);

      await expect(client.getQueue()).rejects.toBeInstanceOf(AgentUnavailableError);
    });

    it('propagates non-network errors as-is', async () => {
      const original = new Error('unexpected');
      fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(original);
      const client = new AgentHttpClient(BASE_URL);

      await expect(client.getQueue()).rejects.toBe(original);
    });
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------
  describe('timeout', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('aborts the request after the default 5 s timeout', () => {
      jest.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;

      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        ((url: string, opts?: RequestInit) => {
          capturedSignal = opts?.signal as AbortSignal;
          return new Promise(() => {}); // never resolves — timeout test only
        }) as any
      );

      const client = new AgentHttpClient(BASE_URL);
      // Do not await — the promise never settles (fetch mock is intentionally blocked)
      void client.getQueue();

      // The AbortController and setTimeout are registered synchronously inside request()
      // before the first await, so they are available immediately.
      expect(capturedSignal?.aborted).toBe(false);
      jest.advanceTimersByTime(5000);
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('invalidateCache uses 1500 ms custom timeout', () => {
      jest.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;

      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        ((url: string, opts?: RequestInit) => {
          capturedSignal = opts?.signal as AbortSignal;
          return new Promise(() => {});
        }) as any
      );

      const client = new AgentHttpClient(BASE_URL);
      void client.invalidateCache({ global: true });

      // Should NOT be aborted at 1000 ms
      jest.advanceTimersByTime(1000);
      expect(capturedSignal?.aborted).toBe(false);

      // Should be aborted at 1500 ms
      jest.advanceTimersByTime(500);
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getQueue
  // -------------------------------------------------------------------------
  describe('getQueue', () => {
    it('calls GET /api/agent/delivery-queue without conversationId', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([]) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.getQueue();

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/api/agent/delivery-queue`);
    });

    it('appends conversationId query param when provided', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([]) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.getQueue('conv_123');

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain('conversationId=conv_123');
    });

    it('URL-encodes conversationId', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk([]) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.getQueue('conv/special&chars');

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain('conv%2Fspecial%26chars');
    });
  });

  // -------------------------------------------------------------------------
  // deleteQueueItem
  // -------------------------------------------------------------------------
  describe('deleteQueueItem', () => {
    it('calls DELETE on the correct path with encoded id', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        mockFetchOk({ deleted: true }) as any
      );
      const client = new AgentHttpClient(BASE_URL);

      await client.deleteQueueItem('item/123');

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('item%2F123');
      expect(opts.method).toBe('DELETE');
    });
  });

  // -------------------------------------------------------------------------
  // editQueueItem
  // -------------------------------------------------------------------------
  describe('editQueueItem', () => {
    it('calls PATCH with JSON body containing content', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk({}) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.editQueueItem('item_99', 'updated text');

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('item_99');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual({ content: 'updated text' });
    });
  });

  // -------------------------------------------------------------------------
  // stopScan
  // -------------------------------------------------------------------------
  describe('stopScan', () => {
    it('calls POST /api/agent/config/:id/stop', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(mockFetchOk(undefined) as any);
      const client = new AgentHttpClient(BASE_URL);

      await client.stopScan('conv_abc');

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/agent/config/conv_abc/stop');
      expect(opts.method).toBe('POST');
    });
  });

  // -------------------------------------------------------------------------
  // invalidateCache
  // -------------------------------------------------------------------------
  describe('invalidateCache', () => {
    it('calls POST /api/agent/cache/invalidate with payload', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        mockFetchOk({ invalidated: 3 }) as any
      );
      const client = new AgentHttpClient(BASE_URL);

      await client.invalidateCache({ conversationId: 'c1', global: false });

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/agent/cache/invalidate');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body as string)).toEqual({ conversationId: 'c1', global: false });
    });

    it('returns the invalidated value from the response', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
        mockFetchOk({ invalidated: 5 }) as any
      );
      const client = new AgentHttpClient(BASE_URL);

      const result = await client.invalidateCache({ global: true });

      expect(result).toEqual({ invalidated: 5 });
    });
  });
});
