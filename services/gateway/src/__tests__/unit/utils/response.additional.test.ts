/**
 * Additional coverage for utils/response.ts — lines not reached by the primary suite:
 *  - sendConflict (line 138)
 *  - buildSuccessResponse (line 163)
 *  - buildErrorResponse (line 182)
 *  - createPaginationMeta (line 200)
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  sendConflict,
  buildSuccessResponse,
  buildErrorResponse,
  createPaginationMeta,
} from '../../../utils/response';

function makeMockReply() {
  let capturedBody: unknown;
  const reply = {
    get body() { return capturedBody; },
    status: jest.fn<any>().mockReturnThis(),
    send: jest.fn<any>().mockImplementation((body: unknown) => {
      capturedBody = body;
      return reply;
    }),
  };
  return reply;
}

describe('sendConflict', () => {
  it('calls sendError with status 409', () => {
    const reply = makeMockReply();
    sendConflict(reply as any, 'Duplicate entry');
    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalled();
    const sent = reply.body as any;
    expect(sent.success).toBe(false);
  });

  it('includes custom message and code when provided', () => {
    const reply = makeMockReply();
    sendConflict(reply as any, 'Conflict', { message: 'Already exists', code: 'DUPLICATE' });
    const sent = reply.body as any;
    expect(sent.message).toBe('Already exists');
    expect(sent.code).toBe('DUPLICATE');
  });
});

describe('buildSuccessResponse', () => {
  it('returns a success response object with data', () => {
    const result = buildSuccessResponse({ id: '1' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '1' });
    expect(result.message).toBeUndefined();
    expect(result.pagination).toBeUndefined();
  });

  it('includes message when provided', () => {
    const result = buildSuccessResponse(null, { message: 'Created' });
    expect(result.message).toBe('Created');
  });

  it('includes pagination when provided', () => {
    const pagination = { total: 100, offset: 0, limit: 10, hasMore: true };
    const result = buildSuccessResponse([], { pagination });
    expect(result.pagination).toEqual(pagination);
  });

  it('includes meta when provided', () => {
    const result = buildSuccessResponse('ok', { meta: { requestId: 'req-1' } });
    expect(result.meta).toEqual({ requestId: 'req-1' });
  });

  it('leaves meta undefined when not provided', () => {
    const result = buildSuccessResponse(42);
    expect(result.meta).toBeUndefined();
  });
});

describe('buildErrorResponse', () => {
  it('returns a failure response object with error string', () => {
    const result = buildErrorResponse('Not found');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });

  it('uses error as message when no message option given', () => {
    const result = buildErrorResponse('Something broke');
    expect(result.message).toBe('Something broke');
  });

  it('uses provided message when given', () => {
    const result = buildErrorResponse('ERR', { message: 'Custom message' });
    expect(result.message).toBe('Custom message');
  });

  it('includes code when provided', () => {
    const result = buildErrorResponse('ERR', { code: 'VALIDATION_FAILED' });
    expect(result.code).toBe('VALIDATION_FAILED');
  });
});

describe('createPaginationMeta', () => {
  it('returns correct pagination metadata', () => {
    const meta = createPaginationMeta(100, 0, 10, 10);
    expect(meta.total).toBe(100);
    expect(meta.offset).toBe(0);
    expect(meta.limit).toBe(10);
    expect(meta.hasMore).toBe(true);
  });

  it('sets hasMore to false when all items are covered', () => {
    const meta = createPaginationMeta(10, 5, 10, 5);
    expect(meta.hasMore).toBe(false);
  });

  it('sets hasMore to false for last page exactly', () => {
    const meta = createPaginationMeta(20, 10, 10, 10);
    expect(meta.hasMore).toBe(false);
  });

  it('sets hasMore to true when more items remain', () => {
    const meta = createPaginationMeta(50, 10, 10, 10);
    expect(meta.hasMore).toBe(true);
  });
});
