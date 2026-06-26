/**
 * Unit tests for AgentHttpClient and AgentUnavailableError
 *
 * Covers:
 *  - Successful GET / DELETE / PATCH / POST requests
 *  - HTTP error response (response.ok = false) → throws with statusCode
 *  - TypeError (network unreachable) → throws AgentUnavailableError
 *  - AbortError (timeout abort) → throws AgentUnavailableError
 *  - Other errors propagated as-is
 *  - getQueue with/without conversationId
 *  - deleteQueueItem, editQueueItem, stopScan, invalidateCache
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AgentHttpClient, AgentUnavailableError } from '../../../services/AgentHttpClient';

// ── Mock fetch ─────────────────────────────────────────────────────────────────

function mockFetchOk(data: unknown) {
  global.fetch = jest.fn<any>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  });
}

function mockFetchError(status: number, message: string) {
  global.fetch = jest.fn<any>().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, message }),
  });
}

function mockFetchThrows(error: Error) {
  global.fetch = jest.fn<any>().mockRejectedValue(error);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentHttpClient', () => {
  let client: AgentHttpClient;

  beforeEach(() => {
    client = new AgentHttpClient('http://agent:9000');
    jest.clearAllMocks();
  });

  // ── getQueue ─────────────────────────────────────────────────────────────

  describe('getQueue', () => {
    it('calls /api/agent/delivery-queue without query param when no conversationId', async () => {
      mockFetchOk([{ id: '1' }]);
      const result = await client.getQueue();
      expect(result).toEqual([{ id: '1' }]);
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/delivery-queue',
        expect.any(Object)
      );
    });

    it('appends conversationId as query param when provided', async () => {
      mockFetchOk([]);
      await client.getQueue('conv-abc');
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/delivery-queue?conversationId=conv-abc',
        expect.any(Object)
      );
    });
  });

  // ── deleteQueueItem ───────────────────────────────────────────────────────

  describe('deleteQueueItem', () => {
    it('sends DELETE request and returns deleted flag', async () => {
      mockFetchOk({ deleted: true });
      const result = await client.deleteQueueItem('item-1');
      expect(result).toEqual({ deleted: true });
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/delivery-queue/item-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ── editQueueItem ─────────────────────────────────────────────────────────

  describe('editQueueItem', () => {
    it('sends PATCH request with body and returns result', async () => {
      mockFetchOk({ updated: true });
      const result = await client.editQueueItem('item-2', 'new content');
      expect(result).toEqual({ updated: true });
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/delivery-queue/item-2',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: 'new content' }),
        })
      );
    });
  });

  // ── stopScan ──────────────────────────────────────────────────────────────

  describe('stopScan', () => {
    it('sends POST to /api/agent/config/:conversationId/stop', async () => {
      mockFetchOk(undefined);
      await client.stopScan('conv-xyz');
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/config/conv-xyz/stop',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── invalidateCache ───────────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('sends POST with payload and returns invalidated result', async () => {
      mockFetchOk({ invalidated: 5 });
      const result = await client.invalidateCache({ global: true });
      expect(result).toEqual({ invalidated: 5 });
      expect(fetch).toHaveBeenCalledWith(
        'http://agent:9000/api/agent/cache/invalidate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ global: true }),
        })
      );
    });
  });

  // ── HTTP error response ───────────────────────────────────────────────────

  describe('HTTP error response', () => {
    it('throws with message from body when response.ok is false', async () => {
      mockFetchError(404, 'Item not found');
      await expect(client.getQueue()).rejects.toThrow('Item not found');
    });

    it('includes statusCode on the thrown error', async () => {
      mockFetchError(503, 'Service Unavailable');
      try {
        await client.getQueue();
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
      }
    });

    it('uses default message when body.message is absent', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false }),
      });
      await expect(client.getQueue()).rejects.toThrow('Agent responded with 500');
    });
  });

  // ── Network errors → AgentUnavailableError ────────────────────────────────

  describe('TypeError / AbortError → AgentUnavailableError', () => {
    it('wraps TypeError in AgentUnavailableError', async () => {
      mockFetchThrows(new TypeError('network failure'));
      await expect(client.getQueue()).rejects.toThrow(AgentUnavailableError);
      await expect(client.getQueue()).rejects.toThrow('Agent service is unreachable');
    });

    it('wraps AbortError (DOMException) in AgentUnavailableError', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetchThrows(abortError);
      await expect(client.getQueue()).rejects.toThrow(AgentUnavailableError);
    });

    it('propagates non-TypeError errors as-is', async () => {
      mockFetchThrows(new Error('unexpected'));
      await expect(client.getQueue()).rejects.toThrow('unexpected');
      await expect(client.getQueue()).rejects.not.toThrow(AgentUnavailableError);
    });
  });

  // ── AgentUnavailableError ─────────────────────────────────────────────────

  describe('AgentUnavailableError', () => {
    it('sets the error name correctly', () => {
      const err = new AgentUnavailableError('test');
      expect(err.name).toBe('AgentUnavailableError');
      expect(err.message).toBe('test');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
