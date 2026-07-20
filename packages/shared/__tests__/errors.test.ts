import { describe, it, expect, vi } from 'vitest';
import { createError, MeeshyError, handleAsync, logError, sendErrorResponse } from '../utils/errors.js';
import { ErrorCode, ErrorMessages, ErrorStatusMap } from '../types/errors.js';

describe('MeeshyError', () => {
  it('should identify client/server errors correctly', () => {
    const clientErr = createError(ErrorCode.VALIDATION_ERROR);
    expect(clientErr.isClientError()).toBe(true);
    expect(clientErr.isServerError()).toBe(false);

    const serverErr = createError(ErrorCode.INTERNAL_ERROR);
    expect(serverErr.isServerError()).toBe(true);
    expect(serverErr.isClientError()).toBe(false);
  });

  it('should convert to JSON with all required fields', () => {
    const err = createError(ErrorCode.NOT_FOUND, 'Custom');
    const json = err.toJSON();
    expect(json.code).toBe(ErrorCode.NOT_FOUND);
    expect(json.message).toBe('Custom');
    expect(json.status).toBe(404);
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should use default message from ErrorMessages when no message provided', () => {
    const err = createError(ErrorCode.NOT_FOUND);
    expect(err.message).toBe(ErrorMessages[ErrorCode.NOT_FOUND].en);
  });

  it('should use fr message when lang=fr', () => {
    const err = new MeeshyError(ErrorCode.NOT_FOUND, undefined, undefined, 'fr');
    expect(err.message).toBe(ErrorMessages[ErrorCode.NOT_FOUND].fr);
  });

  it('should store details when provided', () => {
    const details = { field: 'email', issue: 'invalid' };
    const err = createError(ErrorCode.VALIDATION_ERROR, 'Msg', details);
    expect(err.details).toEqual(details);
    expect(err.toJSON().details).toEqual(details);
  });

  it('should have correct name and code properties', () => {
    const err = createError(ErrorCode.FORBIDDEN);
    expect(err.name).toBe('MeeshyError');
    expect(err.code).toBe(ErrorCode.FORBIDDEN);
    expect(err.status).toBe(ErrorStatusMap[ErrorCode.FORBIDDEN]);
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
  it('should return value on success', async () => {
    const result = await handleAsync(async () => 42);
    expect(result).toBe(42);
  });

  it('should wrap non-MeeshyError in MeeshyError', async () => {
    await expect(handleAsync(async () => { throw new Error('fail'); }))
      .rejects.toBeInstanceOf(MeeshyError);
  });

  it('should re-throw MeeshyError as-is', async () => {
    const original = createError(ErrorCode.FORBIDDEN);
    await expect(handleAsync(async () => { throw original; }))
      .rejects.toBe(original);
  });

  it('should include context in wrapped error details', async () => {
    let caughtError: MeeshyError | null = null;
    try {
      await handleAsync(async () => { throw new Error('db error'); }, ErrorCode.INTERNAL_ERROR, 'database');
    } catch (e) {
      caughtError = e as MeeshyError;
    }
    expect(caughtError?.details?.context).toBe('database');
  });

  it('should use custom errorCode for wrapping', async () => {
    await expect(
      handleAsync(async () => { throw new Error('not found'); }, ErrorCode.NOT_FOUND)
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('should stringify non-Error thrown values in details', async () => {
    let caughtError: MeeshyError | null = null;
    try {
      await handleAsync(async () => { throw 'plain string error'; });
    } catch (e) {
      caughtError = e as MeeshyError;
    }
    expect(caughtError?.details?.originalError).toBe('plain string error');
  });
});

describe('logError', () => {
  it('should log unhandled plain Error to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new Error('test'));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR'),
      expect.objectContaining({ message: 'test' })
    );
    spy.mockRestore();
  });

  it('should log plain Error with context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new Error('ctx error'), 'myContext');
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ context: 'myContext' })
    );
    spy.mockRestore();
  });

  it('should log server-error (5xx) MeeshyError to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const serverErr = createError(ErrorCode.INTERNAL_ERROR);
    logError(serverErr);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR'),
      expect.objectContaining({ message: serverErr.message, status: 500 })
    );
    spy.mockRestore();
  });

  it('should NOT log client-error (4xx) MeeshyError', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clientErr = createError(ErrorCode.FORBIDDEN);
    logError(clientErr);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('sendErrorResponse', () => {
  it('should set status and send body for MeeshyError', () => {
    const send = vi.fn();
    const mockReply = { status: vi.fn().mockReturnValue({ send }) };
    sendErrorResponse(mockReply as any, createError(ErrorCode.FORBIDDEN));
    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: ErrorCode.FORBIDDEN,
    }));
  });

  it('should include details when MeeshyError has details', () => {
    const send = vi.fn();
    const mockReply = { status: vi.fn().mockReturnValue({ send }) };
    const err = createError(ErrorCode.VALIDATION_ERROR, 'bad input', { field: 'email' });
    sendErrorResponse(mockReply as any, err);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ details: { field: 'email' } }));
  });

  it('should return HTTP 500 with generic error for plain Error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn();
    const mockReply = { status: vi.fn().mockReturnValue({ send }) };
    sendErrorResponse(mockReply as any, new Error('unexpected'));
    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: ErrorCode.INTERNAL_ERROR,
    }));
    spy.mockRestore();
  });
});
