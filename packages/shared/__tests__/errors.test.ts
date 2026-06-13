import { describe, it, expect, vi } from 'vitest';
import { createError, MeeshyError, handleAsync, logError, sendErrorResponse } from '../utils/errors.js';
import { ErrorCode, ErrorMessages, ErrorStatusMap } from '../types/errors.js';

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

describe('USER_BLOCKED error code', () => {
  it('is registered in the enum', () => {
    expect(ErrorCode.USER_BLOCKED).toBe('USER_BLOCKED');
  });

  it('maps to HTTP 403', () => {
    expect(ErrorStatusMap[ErrorCode.USER_BLOCKED]).toBe(403);
    expect(createError(ErrorCode.USER_BLOCKED).status).toBe(403);
  });

  it('has FR and EN messages', () => {
    expect(ErrorMessages[ErrorCode.USER_BLOCKED].fr).toBe(
      'Vous ne pouvez pas écrire à cet utilisateur.'
    );
    expect(ErrorMessages[ErrorCode.USER_BLOCKED].en).toBe("You can't message this user.");
  });

  it('is a client error', () => {
    expect(createError(ErrorCode.USER_BLOCKED).isClientError()).toBe(true);
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
