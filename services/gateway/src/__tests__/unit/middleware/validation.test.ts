/**
 * Validation middleware — unit tests
 *
 * Covers:
 * - createValidationMiddleware: happy path, Zod error → 400, non-Zod re-throw
 * - validateSocketEvent: success, ZodError details, unknown-error fallback
 * - isValidationFailure: type guard
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import {
  createValidationMiddleware,
  validateSocketEvent,
  isValidationFailure,
} from '../../../middleware/validation';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: null,
    params: {},
    query: {},
    headers: {},
    url: '/test',
    method: 'POST',
    ...overrides,
  } as any;
}

function makeReply() {
  const reply = {
    status: jest.fn<any>().mockReturnThis(),
    send: jest.fn<any>().mockReturnThis(),
  };
  return reply as any;
}

// ─── createValidationMiddleware ───────────────────────────────────────────────

describe('createValidationMiddleware', () => {
  const schema = z.object({
    body: z.object({ name: z.string().min(1) }),
  });

  it('passes without sending when schema validates successfully', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ body: { name: 'alice' } });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('sends 400 with VALIDATION_ERROR when body fails schema', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ body: { name: '' } });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    const sentBody = reply.send.mock.calls[0][0] as any;
    expect(sentBody.success).toBe(false);
    expect(sentBody.error.code).toBe('VALIDATION_ERROR');
    expect(sentBody.error.details).toBeInstanceOf(Array);
    expect(sentBody.error.details.length).toBeGreaterThan(0);
  });

  it('includes field path in validation error details', async () => {
    const middleware = createValidationMiddleware(schema);
    const request = makeRequest({ body: { name: '' } });
    const reply = makeReply();

    await middleware(request, reply);

    const sentBody = reply.send.mock.calls[0][0] as any;
    const fieldError = sentBody.error.details.find((d: any) => d.field === 'body.name');
    expect(fieldError).toBeDefined();
  });

  it('re-throws non-Zod errors', async () => {
    const throwingSchema = {
      parseAsync: () => Promise.reject(new TypeError('not a zod error')),
    } as unknown as z.ZodType<any>;
    const middleware = createValidationMiddleware(throwingSchema);
    const request = makeRequest({ body: { name: 'ok' } });
    const reply = makeReply();

    await expect(middleware(request, reply)).rejects.toThrow('not a zod error');
  });

  it('includes body, params, query, headers in validation input', async () => {
    const fullSchema = z.object({
      body: z.object({ x: z.number() }),
      params: z.object({ id: z.string() }),
      query: z.object({ q: z.string() }),
    });
    const middleware = createValidationMiddleware(fullSchema);
    const request = makeRequest({
      body: { x: 1 },
      params: { id: 'abc' },
      query: { q: 'test' },
      headers: { 'content-type': 'application/json' },
    });
    const reply = makeReply();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});

// ─── validateSocketEvent ─────────────────────────────────────────────────────

describe('validateSocketEvent', () => {
  const schema = z.object({ emoji: z.string().min(1), messageId: z.string() });

  it('returns success with parsed data when data is valid', () => {
    const result = validateSocketEvent(schema, { emoji: '👍', messageId: 'msg-1' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ emoji: '👍', messageId: 'msg-1' });
    }
  });

  it('returns failure with details when Zod validation fails', () => {
    const result = validateSocketEvent(schema, { emoji: '', messageId: 'msg-1' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
      expect(result.details).toBeInstanceOf(Array);
      expect(result.details!.length).toBeGreaterThan(0);
    }
  });

  it('returns failure with first issue message in error string', () => {
    const result = validateSocketEvent(schema, { emoji: '', messageId: 123 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Validation failed');
    }
  });

  it('returns generic unknown error when thrown value is not a ZodError', () => {
    const throwingSchema = {
      parse: () => { throw new TypeError('unexpected'); },
    } as unknown as z.ZodType<any>;

    const result = validateSocketEvent(throwingSchema, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Validation failed: Unknown error');
    }
  });

  it('includes field names in error details', () => {
    const result = validateSocketEvent(schema, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.details!.map((d: any) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['emoji', 'messageId']));
    }
  });
});

// ─── isValidationFailure ─────────────────────────────────────────────────────

describe('isValidationFailure', () => {
  const schema = z.object({ value: z.number() });

  it('returns false for successful validation', () => {
    const result = validateSocketEvent(schema, { value: 42 });
    expect(isValidationFailure(result)).toBe(false);
  });

  it('returns true for failed validation', () => {
    const result = validateSocketEvent(schema, { value: 'not-a-number' });
    expect(isValidationFailure(result)).toBe(true);
  });
});
