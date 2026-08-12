/**
 * Unit tests for validation middleware
 * Covers: createValidationMiddleware (valid body, invalid body → 400,
 * non-Zod error rethrown, params/query/headers included in validation),
 * and validateSocketEvent (valid data, ZodError → failure result, unknown
 * error → failure result).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createValidationMiddleware,
  validateSocketEvent,
} from '../../../middleware/validation';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReply() {
  const r = {
    status: jest.fn<any>().mockReturnThis(),
    send: jest.fn<any>().mockReturnThis(),
  };
  return r;
}

function makeRequest(overrides: Partial<{ body: any; params: any; query: any; headers: any }> = {}) {
  return {
    body: null,
    params: {},
    query: {},
    headers: {},
    url: '/test',
    method: 'POST',
    ...overrides,
  };
}

// ─── createValidationMiddleware ───────────────────────────────────────────────

describe('createValidationMiddleware', () => {
  const bodySchema = z.object({
    body: z.object({ name: z.string().min(1), age: z.number().int().positive() }),
  });

  it('passes through valid request without calling reply', async () => {
    const middleware = createValidationMiddleware(bodySchema);
    const req = makeRequest({ body: { name: 'Alice', age: 25 } });
    const reply = makeReply();

    await middleware(req as any, reply as any);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR for invalid body', async () => {
    const middleware = createValidationMiddleware(bodySchema);
    const req = makeRequest({ body: { name: '', age: -1 } });
    const reply = makeReply();

    await middleware(req as any, reply as any);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      })
    );
  });

  it('returns details array with field paths for each issue', async () => {
    const middleware = createValidationMiddleware(bodySchema);
    const req = makeRequest({ body: { name: '', age: -1 } });
    const reply = makeReply();

    await middleware(req as any, reply as any);

    const sent = reply.send.mock.calls[0][0];
    expect(sent.error.details).toBeInstanceOf(Array);
    expect(sent.error.details.length).toBeGreaterThanOrEqual(1);
    expect(sent.error.details[0]).toHaveProperty('field');
    expect(sent.error.details[0]).toHaveProperty('message');
  });

  it('rethrows non-Zod errors', async () => {
    const badSchema = {
      parseAsync: jest.fn<any>().mockRejectedValue(new Error('unexpected parse error')),
    } as any;
    const middleware = createValidationMiddleware(badSchema);
    const req = makeRequest({ body: { x: 1 } });
    const reply = makeReply();

    await expect(middleware(req as any, reply as any)).rejects.toThrow('unexpected parse error');
  });

  it('includes params in validation input when present', async () => {
    const paramsSchema = z.object({
      params: z.object({ id: z.string().min(1) }),
    });
    const middleware = createValidationMiddleware(paramsSchema);
    const req = makeRequest({ params: { id: '' } });
    const reply = makeReply();

    await middleware(req as any, reply as any);

    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it('includes query in validation input when present', async () => {
    const querySchema = z.object({
      query: z.object({ limit: z.coerce.number().max(100) }),
    });
    const middleware = createValidationMiddleware(querySchema);
    const req = makeRequest({ query: { limit: '999' } });
    const reply = makeReply();

    await middleware(req as any, reply as any);

    expect(reply.status).toHaveBeenCalledWith(400);
  });
});

// ─── validateSocketEvent ─────────────────────────────────────────────────────

describe('validateSocketEvent', () => {
  const schema = z.object({ messageId: z.string().min(1), emoji: z.string().min(1) });

  it('returns success: true with parsed data for valid input', () => {
    const result = validateSocketEvent(schema, { messageId: 'msg-1', emoji: '👍' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ messageId: 'msg-1', emoji: '👍' });
    }
  });

  it('returns success: false with error message for invalid data', () => {
    const result = validateSocketEvent(schema, { messageId: '', emoji: '👍' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('returns details array describing each issue', () => {
    const result = validateSocketEvent(schema, { messageId: '', emoji: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.details).toBeInstanceOf(Array);
      expect(result.details?.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns failure for completely wrong type', () => {
    const result = validateSocketEvent(schema, 'not-an-object');

    expect(result.success).toBe(false);
  });

  it('returns failure with fallback message for unknown (non-Zod) error', () => {
    const throwingSchema = {
      parse: jest.fn<any>().mockImplementation(() => {
        throw new Error('random non-zod error');
      }),
    } as any;

    const result = validateSocketEvent(throwingSchema, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });
});
