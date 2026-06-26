/**
 * Unit tests for middleware/validation.ts
 * Covers: createValidationMiddleware, validateSocketEvent, isValidationFailure
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import {
  createValidationMiddleware,
  validateSocketEvent,
  isValidationFailure,
} from '../../../middleware/validation';

jest.mock('../../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ── createValidationMiddleware ─────────────────────────────────────────────

function makeRequest(overrides: Partial<{
  body: unknown; params: unknown; query: unknown; headers: unknown; url: string; method: string;
}> = {}): any {
  return { url: '/test', method: 'POST', ...overrides };
}

function makeReply(): any {
  let capturedBody: unknown;
  let capturedStatus = 200;
  const reply: any = {
    get capturedBody() { return capturedBody; },
    get capturedStatus() { return capturedStatus; },
    status: jest.fn<any>().mockImplementation((code: number) => { capturedStatus = code; return reply; }),
    send: jest.fn<any>().mockImplementation((body: unknown) => { capturedBody = body; return reply; }),
  };
  return reply;
}

describe('createValidationMiddleware', () => {
  const schema = z.object({
    body: z.object({ name: z.string() }).optional(),
    query: z.object({ page: z.string().optional() }).optional(),
  });

  it('passes when validation succeeds', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ body: { name: 'Alice' }, query: {} });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.send).not.toHaveBeenCalled();
  });

  it('passes when body is absent', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ query: {} });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.send).not.toHaveBeenCalled();
  });

  it('passes when all fields present including params and headers', async () => {
    const fullSchema = z.object({
      body: z.object({ n: z.string() }).optional(),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
      headers: z.object({}).optional(),
    });
    const middleware = createValidationMiddleware(fullSchema);
    const request = makeRequest({
      body: { n: 'x' },
      params: {},
      query: {},
      headers: { 'content-type': 'application/json' },
    });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.send).not.toHaveBeenCalled();
  });

  it('returns 400 with ZodError details when validation fails', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ body: { name: 123 } });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.capturedStatus).toBe(400);
    const body = reply.capturedBody as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeInstanceOf(Array);
  });

  it('re-throws non-Zod errors', async () => {
    const throwingSchema: z.ZodType<unknown> = {
      parse: () => { throw new Error('unexpected error'); },
      parseAsync: async () => { throw new Error('unexpected error'); },
    } as any;

    const middleware = createValidationMiddleware(throwingSchema);
    const request = makeRequest({ body: {} });
    const reply = makeReply();

    await expect(middleware(request, reply)).rejects.toThrow('unexpected error');
  });
});

// ── validateSocketEvent ────────────────────────────────────────────────────

describe('validateSocketEvent', () => {
  const schema = z.object({ messageId: z.string(), emoji: z.string() });

  it('returns success with parsed data for valid input', () => {
    const result = validateSocketEvent(schema, { messageId: 'abc', emoji: '👍' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ messageId: 'abc', emoji: '👍' });
    }
  });

  it('returns failure with error message for invalid input', () => {
    const result = validateSocketEvent(schema, { messageId: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
      expect(result.details).toBeInstanceOf(Array);
    }
  });

  it('returns failure with unknown error for non-Zod throws', () => {
    const throwingSchema: z.ZodType<unknown> = {
      parse: () => { throw new Error('non-zod error'); },
    } as any;

    const result = validateSocketEvent(throwingSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Validation failed: Unknown error');
    }
  });
});

// ── isValidationFailure ────────────────────────────────────────────────────

describe('isValidationFailure', () => {
  it('returns true for failure result', () => {
    expect(isValidationFailure({ success: false, error: 'err' })).toBe(true);
  });

  it('returns false for success result', () => {
    expect(isValidationFailure({ success: true, data: {} })).toBe(false);
  });
});
