/**
 * Unit tests for gateway response utilities.
 * Covers: sendSuccess, sendPaginatedSuccess, sendError, convenience helpers
 * (sendBadRequest/Unauthorized/Forbidden/NotFound/Conflict/InternalError),
 * buildSuccessResponse, buildErrorResponse, createPaginationMeta.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  sendSuccess,
  sendPaginatedSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendInternalError,
  buildSuccessResponse,
  buildErrorResponse,
  createPaginationMeta,
} from '../../../utils/response';

// ─── Reply factory ───────────────────────────────────────────────────────────

function makeReply() {
  const r = {
    status: jest.fn<any>().mockReturnThis(),
    send: jest.fn<any>().mockReturnThis(),
  };
  return r;
}

// ─── sendSuccess ─────────────────────────────────────────────────────────────

describe('sendSuccess', () => {
  it('sends 200 with success:true and data', () => {
    const reply = makeReply();
    sendSuccess(reply as any, { id: '1', name: 'Alice' });

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { id: '1', name: 'Alice' } })
    );
  });

  it('includes optional message when provided', () => {
    const reply = makeReply();
    sendSuccess(reply as any, {}, { message: 'Created' });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.message).toBe('Created');
  });

  it('includes pagination when provided', () => {
    const reply = makeReply();
    const pag = { total: 50, offset: 0, limit: 10, hasMore: true };
    sendSuccess(reply as any, [], { pagination: pag });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.pagination).toEqual(pag);
  });

  it('uses custom statusCode when provided', () => {
    const reply = makeReply();
    sendSuccess(reply as any, {}, { statusCode: 201 });

    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it('includes meta when provided', () => {
    const reply = makeReply();
    sendSuccess(reply as any, {}, { meta: { requestId: 'req-1' } as any });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.meta).toEqual({ requestId: 'req-1' });
  });

  it('omits meta when not provided', () => {
    const reply = makeReply();
    sendSuccess(reply as any, {});

    const sent = reply.send.mock.calls[0][0];
    expect(sent.meta).toBeUndefined();
  });
});

// ─── sendPaginatedSuccess ─────────────────────────────────────────────────────

describe('sendPaginatedSuccess', () => {
  it('sends 200 with data and pagination', () => {
    const reply = makeReply();
    const pag = { total: 100, offset: 20, limit: 10, hasMore: true };
    sendPaginatedSuccess(reply as any, ['a', 'b'], pag);

    expect(reply.status).toHaveBeenCalledWith(200);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.success).toBe(true);
    expect(sent.data).toEqual(['a', 'b']);
    expect(sent.pagination).toEqual(pag);
  });

  it('includes optional message', () => {
    const reply = makeReply();
    const pag = { total: 0, offset: 0, limit: 10, hasMore: false };
    sendPaginatedSuccess(reply as any, [], pag, { message: 'No results' });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.message).toBe('No results');
  });

  it('omits meta when not provided', () => {
    const reply = makeReply();
    const pag = { total: 1, offset: 0, limit: 10, hasMore: false };
    sendPaginatedSuccess(reply as any, [{}], pag);

    const sent = reply.send.mock.calls[0][0];
    expect(sent.meta).toBeUndefined();
  });
});

// ─── sendError ───────────────────────────────────────────────────────────────

describe('sendError', () => {
  it('sends the provided status code with success:false', () => {
    const reply = makeReply();
    sendError(reply as any, 422, 'Unprocessable Entity');

    expect(reply.status).toHaveBeenCalledWith(422);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.success).toBe(false);
    expect(sent.error).toBe('Unprocessable Entity');
  });

  it('uses the error string as message fallback', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'Bad input');

    const sent = reply.send.mock.calls[0][0];
    expect(sent.message).toBe('Bad input');
  });

  it('overrides message when options.message is provided', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'Bad input', { message: 'Custom message' });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.message).toBe('Custom message');
  });

  it('includes code when provided', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'Bad input', { code: 'VALIDATION_ERROR' });

    const sent = reply.send.mock.calls[0][0];
    expect(sent.code).toBe('VALIDATION_ERROR');
  });
});

// ─── Convenience helpers ──────────────────────────────────────────────────────

describe('sendBadRequest', () => {
  it('sends 400', () => {
    const reply = makeReply();
    sendBadRequest(reply as any, 'Invalid input');
    expect(reply.status).toHaveBeenCalledWith(400);
  });
});

describe('sendUnauthorized', () => {
  it('sends 401 with default message', () => {
    const reply = makeReply();
    sendUnauthorized(reply as any);
    expect(reply.status).toHaveBeenCalledWith(401);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toContain('Authentication');
  });

  it('sends 401 with custom message', () => {
    const reply = makeReply();
    sendUnauthorized(reply as any, 'Token expired');
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toBe('Token expired');
  });
});

describe('sendForbidden', () => {
  it('sends 403 with default message', () => {
    const reply = makeReply();
    sendForbidden(reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toContain('Access');
  });

  it('sends 403 with custom message', () => {
    const reply = makeReply();
    sendForbidden(reply as any, 'Insufficient role');
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toBe('Insufficient role');
  });
});

describe('sendNotFound', () => {
  it('sends 404 with default message', () => {
    const reply = makeReply();
    sendNotFound(reply as any);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it('sends 404 with custom resource name', () => {
    const reply = makeReply();
    sendNotFound(reply as any, 'User not found');
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toBe('User not found');
  });
});

describe('sendConflict', () => {
  it('sends 409', () => {
    const reply = makeReply();
    sendConflict(reply as any, 'Duplicate entry');
    expect(reply.status).toHaveBeenCalledWith(409);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toBe('Duplicate entry');
  });
});

describe('sendInternalError', () => {
  it('sends 500 with default message', () => {
    const reply = makeReply();
    sendInternalError(reply as any);
    expect(reply.status).toHaveBeenCalledWith(500);
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toContain('Internal');
  });

  it('sends 500 with custom message', () => {
    const reply = makeReply();
    sendInternalError(reply as any, 'DB connection lost');
    const sent = reply.send.mock.calls[0][0];
    expect(sent.error).toBe('DB connection lost');
  });
});

// ─── buildSuccessResponse ─────────────────────────────────────────────────────

describe('buildSuccessResponse', () => {
  it('returns object with success:true and data', () => {
    const result = buildSuccessResponse({ value: 42 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ value: 42 });
  });

  it('includes message when provided', () => {
    const result = buildSuccessResponse({}, { message: 'Done' });
    expect(result.message).toBe('Done');
  });

  it('includes pagination when provided', () => {
    const pag = { total: 5, offset: 0, limit: 10, hasMore: false };
    const result = buildSuccessResponse([], { pagination: pag });
    expect(result.pagination).toEqual(pag);
  });

  it('omits meta when not provided', () => {
    const result = buildSuccessResponse({});
    expect(result.meta).toBeUndefined();
  });

  it('includes meta when provided', () => {
    const result = buildSuccessResponse({}, { meta: { duration: 42 } as any });
    expect(result.meta).toEqual({ duration: 42 });
  });
});

// ─── buildErrorResponse ───────────────────────────────────────────────────────

describe('buildErrorResponse', () => {
  it('returns object with success:false and error', () => {
    const result = buildErrorResponse('Something went wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });

  it('uses error as message fallback', () => {
    const result = buildErrorResponse('Oops');
    expect(result.message).toBe('Oops');
  });

  it('overrides message when options.message is provided', () => {
    const result = buildErrorResponse('Oops', { message: 'Custom' });
    expect(result.message).toBe('Custom');
  });

  it('includes code when provided', () => {
    const result = buildErrorResponse('Oops', { code: 'ERR_CODE' });
    expect(result.code).toBe('ERR_CODE');
  });

  it('omits code when not provided', () => {
    const result = buildErrorResponse('Oops');
    expect(result.code).toBeUndefined();
  });
});

// ─── createPaginationMeta ─────────────────────────────────────────────────────

describe('createPaginationMeta', () => {
  it('sets hasMore=true when more items remain', () => {
    const meta = createPaginationMeta(100, 0, 10, 10);
    expect(meta.hasMore).toBe(true);
    expect(meta.total).toBe(100);
    expect(meta.offset).toBe(0);
    expect(meta.limit).toBe(10);
  });

  it('sets hasMore=false when all items are returned', () => {
    const meta = createPaginationMeta(5, 0, 10, 5);
    expect(meta.hasMore).toBe(false);
  });

  it('sets hasMore=false on the last page (exact fit)', () => {
    const meta = createPaginationMeta(20, 10, 10, 10);
    expect(meta.hasMore).toBe(false);
  });

  it('handles empty result set', () => {
    const meta = createPaginationMeta(0, 0, 10, 0);
    expect(meta.hasMore).toBe(false);
    expect(meta.total).toBe(0);
  });

  it('handles offset mid-dataset', () => {
    const meta = createPaginationMeta(30, 10, 10, 10);
    expect(meta.hasMore).toBe(true); // 10+10=20 < 30
  });
});
