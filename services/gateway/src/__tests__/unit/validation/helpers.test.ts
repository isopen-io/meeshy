/**
 * validation/helpers.ts — unit tests
 *
 * Covers: createValidator (body/query/params), validateQuery, validateBody,
 * validateParams; Zod success/failure/non-Zod paths.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import {
  createValidator,
  validateQuery,
  validateBody,
  validateParams,
} from '../../../validation/helpers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(data: Record<string, unknown>) {
  let sent: unknown;
  let sentStatus = 0;
  const reply = {
    status: jest.fn((code: number) => { sentStatus = code; return reply; }),
    send: jest.fn((body: unknown) => { sent = body; return reply; }),
    get sentStatus() { return sentStatus; },
    get sent() { return sent; },
  } as any;
  const request = { ...data } as any;
  return { request, reply };
}

// ─── createValidator ──────────────────────────────────────────────────────────

describe('createValidator', () => {
  const bodySchema = z.object({ name: z.string().min(1) });

  describe('source: body', () => {
    it('passes when body satisfies schema and replaces request.body with parsed value', async () => {
      const validate = createValidator(bodySchema, 'body');
      const { request, reply } = makeCtx({ body: { name: 'Alice' } });

      await validate(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(request.body).toEqual({ name: 'Alice' });
    });

    it('sends 400 with Zod errors when body fails schema', async () => {
      const validate = createValidator(bodySchema, 'body');
      const { request, reply } = makeCtx({ body: { name: '' } });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      const body = reply.sent as any;
      expect(body.success).toBe(false);
      expect(body.message).toBe('Validation failed');
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors[0]).toHaveProperty('field');
      expect(body.errors[0]).toHaveProperty('message');
      expect(body.errors[0]).toHaveProperty('code');
    });

    it('sends 400 when body is completely missing required fields', async () => {
      const validate = createValidator(bodySchema, 'body');
      const { request, reply } = makeCtx({ body: {} });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('sends 500 when a non-Zod error is thrown by schema', async () => {
      const throwingSchema = {
        parseAsync: () => Promise.reject(new TypeError('unexpected')),
      } as unknown as z.ZodSchema;
      const validate = createValidator(throwingSchema, 'body');
      const { request, reply } = makeCtx({ body: {} });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      const body = reply.sent as any;
      expect(body.success).toBe(false);
      expect(body.error).toContain('unexpected');
    });

    it('sends 500 with "Unknown error" when non-Zod thrown value is not an Error', async () => {
      const throwingSchema = {
        parseAsync: () => Promise.reject('plain string'),
      } as unknown as z.ZodSchema;
      const validate = createValidator(throwingSchema, 'body');
      const { request, reply } = makeCtx({ body: {} });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      const body = reply.sent as any;
      expect(body.error).toBe('Unknown error');
    });
  });

  describe('source: query', () => {
    const querySchema = z.object({ page: z.coerce.number().int().min(1) });

    it('passes for valid query and replaces request.query', async () => {
      const validate = createValidator(querySchema, 'query');
      const { request, reply } = makeCtx({ query: { page: '2' } });

      await validate(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(request.query.page).toBe(2);
    });

    it('sends 400 for invalid query', async () => {
      const validate = createValidator(querySchema, 'query');
      const { request, reply } = makeCtx({ query: { page: '0' } });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('source: params', () => {
    const paramsSchema = z.object({ id: z.string().length(24) });

    it('passes for valid params and replaces request.params', async () => {
      const validate = createValidator(paramsSchema, 'params');
      const { request, reply } = makeCtx({ params: { id: 'a'.repeat(24) } });

      await validate(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(request.params.id).toBe('a'.repeat(24));
    });

    it('sends 400 for invalid params', async () => {
      const validate = createValidator(paramsSchema, 'params');
      const { request, reply } = makeCtx({ params: { id: 'short' } });

      await validate(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  it('includes nested field paths in error details', async () => {
    const nested = z.object({ user: z.object({ email: z.string().email() }) });
    const validate = createValidator(nested, 'body');
    const { request, reply } = makeCtx({ body: { user: { email: 'not-an-email' } } });

    await validate(request, reply);

    const body = reply.sent as any;
    const emailError = body.errors.find((e: any) => e.field === 'user.email');
    expect(emailError).toBeDefined();
  });
});

// ─── validateQuery / validateBody / validateParams ────────────────────────────

describe('validateQuery', () => {
  it('is a convenience wrapper for createValidator with source=query', async () => {
    const schema = z.object({ limit: z.coerce.number().max(100) });
    const validate = validateQuery(schema);
    const { request, reply } = makeCtx({ query: { limit: '50' } });

    await validate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.query.limit).toBe(50);
  });

  it('sends 400 for invalid query', async () => {
    const schema = z.object({ limit: z.coerce.number().max(100) });
    const validate = validateQuery(schema);
    const { request, reply } = makeCtx({ query: { limit: '999' } });

    await validate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
  });
});

describe('validateBody', () => {
  it('is a convenience wrapper for createValidator with source=body', async () => {
    const schema = z.object({ title: z.string() });
    const validate = validateBody(schema);
    const { request, reply } = makeCtx({ body: { title: 'Hello' } });

    await validate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.body.title).toBe('Hello');
  });
});

describe('validateParams', () => {
  it('is a convenience wrapper for createValidator with source=params', async () => {
    const schema = z.object({ userId: z.string() });
    const validate = validateParams(schema);
    const { request, reply } = makeCtx({ params: { userId: 'u-123' } });

    await validate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.params.userId).toBe('u-123');
  });
});
