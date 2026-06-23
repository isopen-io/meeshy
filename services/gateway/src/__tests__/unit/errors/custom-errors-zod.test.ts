import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { errorHandler } from '../../../errors/custom-errors';

type CapturedReply = {
  statusCode: number | null;
  body: unknown;
  status: (code: number) => CapturedReply;
  send: (payload: unknown) => CapturedReply;
};

const createReply = (): CapturedReply => {
  const reply: CapturedReply = {
    statusCode: null,
    body: null,
    status(code) {
      reply.statusCode = code;
      return reply;
    },
    send(payload) {
      reply.body = payload;
      return reply;
    },
  };
  return reply;
};

const zodErrorFor = (): z.ZodError => {
  const schema = z.object({ email: z.string().email(), age: z.number().int() });
  const result = schema.safeParse({ email: 'not-an-email', age: 'nope' });
  if (result.success) {
    throw new Error('fixture should have failed validation');
  }
  return result.error;
};

describe('errorHandler — ZodError branch (zod v4)', () => {
  it('maps a ZodError to a 400 with field-level errors sourced from issues', () => {
    const reply = createReply();
    const request = { log: { error: () => undefined } };

    errorHandler(zodErrorFor() as unknown as Error, request, reply);

    expect(reply.statusCode).toBe(400);
    const body = reply.body as { success: boolean; error: { code: string; errors: Record<string, string> } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.errors)).toEqual(expect.arrayContaining(['email', 'age']));
    expect(body.error.errors.email).toEqual(expect.any(String));
  });
});
