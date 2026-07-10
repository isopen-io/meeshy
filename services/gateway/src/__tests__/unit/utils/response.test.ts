import {
  buildSuccessResponse,
  buildErrorResponse,
  createPaginationMeta,
  sendSuccess,
  sendPaginatedSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendInternalError,
} from '../../../utils/response';

function makeReply() {
  let sentStatus = 0;
  let sentBody: unknown = undefined;
  const reply = {
    status: jest.fn((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn((body: unknown) => {
      sentBody = body;
      return reply;
    }),
    get sentStatus() { return sentStatus; },
    get sentBody() { return sentBody; },
  };
  return reply;
}

// ─── buildSuccessResponse ──────────────────────────────────────────────────

describe('buildSuccessResponse', () => {
  it('returns success:true with data', () => {
    const res = buildSuccessResponse({ id: '1' });
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: '1' });
  });

  it('includes message when provided', () => {
    const res = buildSuccessResponse(null, { message: 'Done' });
    expect(res.message).toBe('Done');
  });

  it('includes pagination when provided', () => {
    const pagination = { total: 100, offset: 0, limit: 10, hasMore: true };
    const res = buildSuccessResponse([], { pagination });
    expect(res.pagination).toEqual(pagination);
  });

  it('includes meta when provided', () => {
    const res = buildSuccessResponse(null, { meta: { requestId: 'r1' } });
    expect(res.meta).toEqual({ requestId: 'r1' });
  });

  it('omits meta when not provided', () => {
    const res = buildSuccessResponse(null);
    expect(res.meta).toBeUndefined();
  });
});

// ─── buildErrorResponse ───────────────────────────────────────────────────

describe('buildErrorResponse', () => {
  it('returns success:false with error', () => {
    const res = buildErrorResponse('Something went wrong');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Something went wrong');
  });

  it('uses error as message when message not provided', () => {
    const res = buildErrorResponse('Not found');
    expect(res.message).toBe('Not found');
  });

  it('uses options.message when provided', () => {
    const res = buildErrorResponse('err', { message: 'Custom message' });
    expect(res.message).toBe('Custom message');
  });

  it('includes code when provided', () => {
    const res = buildErrorResponse('err', { code: 'E_NOTFOUND' });
    expect(res.code).toBe('E_NOTFOUND');
  });
});

// ─── createPaginationMeta ─────────────────────────────────────────────────

describe('createPaginationMeta', () => {
  it('hasMore is true when there are more results', () => {
    const meta = createPaginationMeta(100, 0, 10, 10);
    expect(meta.hasMore).toBe(true);
    expect(meta.total).toBe(100);
    expect(meta.offset).toBe(0);
    expect(meta.limit).toBe(10);
  });

  it('hasMore is false when last page is returned', () => {
    const meta = createPaginationMeta(10, 0, 10, 10);
    expect(meta.hasMore).toBe(false);
  });

  it('hasMore is false when result count is less than limit (partial page)', () => {
    const meta = createPaginationMeta(25, 20, 10, 5);
    expect(meta.hasMore).toBe(false);
  });

  it('hasMore is false when result count is zero', () => {
    const meta = createPaginationMeta(0, 0, 10, 0);
    expect(meta.hasMore).toBe(false);
  });

  it('hasMore is true on middle page', () => {
    const meta = createPaginationMeta(50, 10, 10, 10);
    expect(meta.hasMore).toBe(true);
  });
});

// ─── sendSuccess ──────────────────────────────────────────────────────────

describe('sendSuccess', () => {
  it('sends 200 with success response', () => {
    const reply = makeReply();
    sendSuccess(reply as any, { id: '1' });
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.sentBody).toMatchObject({ success: true, data: { id: '1' } });
  });

  it('uses custom statusCode when provided', () => {
    const reply = makeReply();
    sendSuccess(reply as any, null, { statusCode: 201 });
    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it('includes message in response', () => {
    const reply = makeReply();
    sendSuccess(reply as any, null, { message: 'Created' });
    expect((reply.sentBody as any).message).toBe('Created');
  });

  it('includes pagination in response', () => {
    const reply = makeReply();
    const pagination = { total: 5, offset: 0, limit: 5, hasMore: false };
    sendSuccess(reply as any, [], { pagination });
    expect((reply.sentBody as any).pagination).toEqual(pagination);
  });
});

// ─── sendPaginatedSuccess ────────────────────────────────────────────────

describe('sendPaginatedSuccess', () => {
  it('sends 200 with paginated data', () => {
    const reply = makeReply();
    const pagination = { total: 20, offset: 0, limit: 10, hasMore: true };
    sendPaginatedSuccess(reply as any, [1, 2], pagination);
    expect(reply.status).toHaveBeenCalledWith(200);
    expect((reply.sentBody as any).pagination).toEqual(pagination);
    expect((reply.sentBody as any).data).toEqual([1, 2]);
  });
});

// ─── sendError ────────────────────────────────────────────────────────────

describe('sendError', () => {
  it('sends the given status code', () => {
    const reply = makeReply();
    sendError(reply as any, 422, 'Validation error');
    expect(reply.status).toHaveBeenCalledWith(422);
  });

  it('sends success:false with error field', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'Bad input');
    expect((reply.sentBody as any).success).toBe(false);
    expect((reply.sentBody as any).error).toBe('Bad input');
  });

  it('uses options.message when provided', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'err', { message: 'Custom' });
    expect((reply.sentBody as any).message).toBe('Custom');
  });

  it('falls back to error string as message', () => {
    const reply = makeReply();
    sendError(reply as any, 400, 'Bad input');
    expect((reply.sentBody as any).message).toBe('Bad input');
  });
});

// ─── sendBadRequest ───────────────────────────────────────────────────────

describe('sendBadRequest', () => {
  it('sends 400', () => {
    const reply = makeReply();
    sendBadRequest(reply as any, 'Invalid data');
    expect(reply.status).toHaveBeenCalledWith(400);
    expect((reply.sentBody as any).error).toBe('Invalid data');
  });
});

// ─── sendUnauthorized ─────────────────────────────────────────────────────

describe('sendUnauthorized', () => {
  it('sends 401 with default message', () => {
    const reply = makeReply();
    sendUnauthorized(reply as any);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect((reply.sentBody as any).error).toBe('Authentication required');
  });

  it('sends 401 with custom error string', () => {
    const reply = makeReply();
    sendUnauthorized(reply as any, 'Token expired');
    expect((reply.sentBody as any).error).toBe('Token expired');
  });
});

// ─── sendForbidden ────────────────────────────────────────────────────────

describe('sendForbidden', () => {
  it('sends 403 with default message', () => {
    const reply = makeReply();
    sendForbidden(reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect((reply.sentBody as any).error).toBe('Access denied');
  });
});

// ─── sendNotFound ─────────────────────────────────────────────────────────

describe('sendNotFound', () => {
  it('sends 404 with default message', () => {
    const reply = makeReply();
    sendNotFound(reply as any);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect((reply.sentBody as any).error).toBe('Resource not found');
  });

  it('sends 404 with custom error string', () => {
    const reply = makeReply();
    sendNotFound(reply as any, 'User not found');
    expect((reply.sentBody as any).error).toBe('User not found');
  });
});

// ─── sendConflict ─────────────────────────────────────────────────────────

describe('sendConflict', () => {
  it('sends 409', () => {
    const reply = makeReply();
    sendConflict(reply as any, 'Email already in use');
    expect(reply.status).toHaveBeenCalledWith(409);
    expect((reply.sentBody as any).error).toBe('Email already in use');
  });
});

// ─── sendInternalError ────────────────────────────────────────────────────

describe('sendInternalError', () => {
  it('sends 500 with default message', () => {
    const reply = makeReply();
    sendInternalError(reply as any);
    expect(reply.status).toHaveBeenCalledWith(500);
    expect((reply.sentBody as any).error).toBe('Internal server error');
  });

  it('sends 500 with custom message', () => {
    const reply = makeReply();
    sendInternalError(reply as any, 'DB crashed');
    expect((reply.sentBody as any).error).toBe('DB crashed');
  });
});
