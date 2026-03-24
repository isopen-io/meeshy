import { describe, it, expect, vi } from 'vitest';
import { createError, MeeshyError, handleAsync, logError, sendErrorResponse } from '../utils/errors.js';
import { ErrorCode } from '../types/errors.js';

describe('MeeshyError', () => {
  it('should identify client/server errors', () => {
    const clientErr = createError(ErrorCode.VALIDATION_ERROR);
    expect(clientErr.isClientError()).toBe(true);
    expect(clientErr.isServerError()).toBe(false);

    const serverErr = createError(ErrorCode.INTERNAL_ERROR);
    expect(serverErr.isServerError()).toBe(true);
  });

  it('should convert to JSON', () => {
    const err = createError(ErrorCode.NOT_FOUND, 'Custom');
    const json = err.toJSON();
    expect(json.code).toBe(ErrorCode.NOT_FOUND);
    expect(json.message).toBe('Custom');
  });
});

describe('handleAsync', () => {
  it('should wrap errors', async () => {
    try {
      await handleAsync(async () => { throw new Error('fail'); });
    } catch (error: any) {
      expect(error).toBeInstanceOf(MeeshyError);
    }
  });
});

describe('logError', () => {
  it('should log to console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new Error('test'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('sendErrorResponse', () => {
  it('should set status and send', () => {
    const mockReply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    sendErrorResponse(mockReply as any, createError(ErrorCode.FORBIDDEN));
    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalled();
  });
});
