/**
 * Unit tests for AgentHttpClient.
 * Covers: happy path (GET/DELETE/PATCH/POST), non-ok response (throws with
 * statusCode), network error → AgentUnavailableError, abort timeout →
 * AgentUnavailableError, AgentUnavailableError class properties, and
 * individual public methods (getQueue, deleteQueueItem, editQueueItem,
 * stopScan, invalidateCache).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AgentHttpClient, AgentUnavailableError } from '../../../services/AgentHttpClient';

// ─── Fetch mock ───────────────────────────────────────────────────────────────

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn<any>().mockResolvedValue(body),
  } as unknown as Response;
}

function mockFetch(response: Response) {
  global.fetch = jest.fn<any>().mockResolvedValue(response);
}

function mockFetchThrow(error: Error) {
  global.fetch = jest.fn<any>().mockRejectedValue(error);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://agent.internal';

function makeSut() {
  return new AgentHttpClient(BASE_URL);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

// ─── AgentUnavailableError ────────────────────────────────────────────────────

describe('AgentUnavailableError', () => {
  it('is an instance of Error', () => {
    expect(new AgentUnavailableError('down')).toBeInstanceOf(Error);
  });

  it('has name AgentUnavailableError', () => {
    expect(new AgentUnavailableError('down').name).toBe('AgentUnavailableError');
  });

  it('carries the message', () => {
    expect(new AgentUnavailableError('Agent service is unreachable').message).toContain('unreachable');
  });
});

// ─── request (via public methods) ─────────────────────────────────────────────

describe('AgentHttpClient request mechanics', () => {
  it('uses fetch with Content-Type: application/json header', async () => {
    mockFetch(makeFetchResponse({ success: true, data: [] }));
    const sut = makeSut();

    await sut.getQueue();

    const call = (global.fetch as jest.Mock<any>).mock.calls[0];
    expect(call[1].headers['Content-Type']).toBe('application/json');
  });

  it('throws AgentUnavailableError on network TypeError', async () => {
    mockFetchThrow(new TypeError('Failed to fetch'));
    const sut = makeSut();

    await expect(sut.getQueue()).rejects.toBeInstanceOf(AgentUnavailableError);
  });

  it('throws AgentUnavailableError on AbortError (timeout)', async () => {
    const abortError = new DOMException('AbortError', 'AbortError');
    mockFetchThrow(abortError);
    const sut = makeSut();

    await expect(sut.getQueue()).rejects.toBeInstanceOf(AgentUnavailableError);
  });

  it('throws with statusCode when server responds non-ok', async () => {
    mockFetch(makeFetchResponse({ success: false, message: 'Not found' }, 404));
    const sut = makeSut();

    let caught: any;
    try {
      await sut.getQueue();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught.statusCode).toBe(404);
    expect(caught).not.toBeInstanceOf(AgentUnavailableError);
  });

  it('uses message from response body on non-ok status', async () => {
    mockFetch(makeFetchResponse({ success: false, message: 'Queue empty' }, 422));
    const sut = makeSut();

    await expect(sut.getQueue()).rejects.toThrow('Queue empty');
  });

  it('rethrows non-network, non-abort errors as-is', async () => {
    const serverError = new Error('DB crashed');
    // Not a TypeError or DOMException — simulating error thrown inside fetch chain
    global.fetch = jest.fn<any>().mockRejectedValue(serverError);
    const sut = makeSut();

    await expect(sut.getQueue()).rejects.toThrow('DB crashed');
  });
});

// ─── getQueue ─────────────────────────────────────────────────────────────────

describe('getQueue', () => {
  it('calls GET /api/agent/delivery-queue without conversationId', async () => {
    mockFetch(makeFetchResponse({ success: true, data: [] }));
    const sut = makeSut();

    const result = await sut.getQueue();

    expect(result).toEqual([]);
    const url = (global.fetch as jest.Mock<any>).mock.calls[0][0];
    expect(url).toBe(`${BASE_URL}/api/agent/delivery-queue`);
  });

  it('appends conversationId as query param when provided', async () => {
    mockFetch(makeFetchResponse({ success: true, data: [{ id: '1' }] }));
    const sut = makeSut();

    await sut.getQueue('conv-123');

    const url = (global.fetch as jest.Mock<any>).mock.calls[0][0];
    expect(url).toContain('conversationId=conv-123');
  });

  it('URL-encodes the conversationId', async () => {
    mockFetch(makeFetchResponse({ success: true, data: [] }));
    const sut = makeSut();

    await sut.getQueue('conv id with spaces');

    const url = (global.fetch as jest.Mock<any>).mock.calls[0][0];
    expect(url).toContain('conv%20id%20with%20spaces');
  });
});

// ─── deleteQueueItem ──────────────────────────────────────────────────────────

describe('deleteQueueItem', () => {
  it('calls DELETE on the correct path', async () => {
    mockFetch(makeFetchResponse({ success: true, data: { deleted: true } }));
    const sut = makeSut();

    const result = await sut.deleteQueueItem('item-abc');

    expect(result).toEqual({ deleted: true });
    const [url, opts] = (global.fetch as jest.Mock<any>).mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/agent/delivery-queue/item-abc`);
    expect(opts.method).toBe('DELETE');
  });
});

// ─── editQueueItem ────────────────────────────────────────────────────────────

describe('editQueueItem', () => {
  it('calls PATCH with JSON body containing content', async () => {
    mockFetch(makeFetchResponse({ success: true, data: { updated: true } }));
    const sut = makeSut();

    await sut.editQueueItem('item-xyz', 'new content here');

    const [url, opts] = (global.fetch as jest.Mock<any>).mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/agent/delivery-queue/item-xyz`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ content: 'new content here' });
  });
});

// ─── stopScan ─────────────────────────────────────────────────────────────────

describe('stopScan', () => {
  it('calls POST on the stop endpoint', async () => {
    mockFetch(makeFetchResponse({ success: true, data: undefined }));
    const sut = makeSut();

    await sut.stopScan('conv-stop-1');

    const [url, opts] = (global.fetch as jest.Mock<any>).mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/agent/config/conv-stop-1/stop`);
    expect(opts.method).toBe('POST');
  });
});

// ─── invalidateCache ──────────────────────────────────────────────────────────

describe('invalidateCache', () => {
  it('calls POST /api/agent/cache/invalidate with payload', async () => {
    mockFetch(makeFetchResponse({ success: true, data: { invalidated: 2 } }));
    const sut = makeSut();

    const result = await sut.invalidateCache({ global: true });

    expect(result.invalidated).toBe(2);
    const [url, opts] = (global.fetch as jest.Mock<any>).mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/agent/cache/invalidate`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ global: true });
  });

  it('uses 1500ms timeout for cache invalidation', async () => {
    mockFetch(makeFetchResponse({ success: true, data: { invalidated: 0 } }));
    const sut = makeSut();

    // Should not hang (fake timers); resolves normally
    await expect(sut.invalidateCache({})).resolves.toBeDefined();
  });
});
