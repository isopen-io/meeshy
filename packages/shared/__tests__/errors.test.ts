/**
 * Tests for Error Utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MeeshyError,
  createError,
  handleAsync,
  logError,
  sendErrorResponse,
} from '../utils/errors';
import { ErrorCode, ErrorMessages } from '../types/errors';

describe('MeeshyError', () => {
  describe('constructor', () => {
    it('should create error with default message in English', () => {
      const error = new MeeshyError(ErrorCode.NOT_FOUND);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.message).toBe(ErrorMessages[ErrorCode.NOT_FOUND].en);
      expect(error.status).toBe(404);
      expect(error.name).toBe('MeeshyError');
      expect(error.timestamp).toBeDefined();
    });

    it('should create error with default message in French', () => {
      const error = new MeeshyError(ErrorCode.NOT_FOUND, undefined, undefined, 'fr');
      expect(error.message).toBe(ErrorMessages[ErrorCode.NOT_FOUND].fr);
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Custom error message';
      const error = new MeeshyError(ErrorCode.NOT_FOUND, customMessage);
      expect(error.message).toBe(customMessage);
    });

    it('should include details when provided', () => {
      const details = { userId: '123', reason: 'test' };
      const error = new MeeshyError(ErrorCode.NOT_FOUND, undefined, details);
      expect(error.details).toEqual(details);
    });

    it('should have correct status for different error codes', () => {
      expect(new MeeshyError(ErrorCode.UNAUTHORIZED).status).toBe(401);
      expect(new MeeshyError(ErrorCode.FORBIDDEN).status).toBe(403);
      expect(new MeeshyError(ErrorCode.VALIDATION_ERROR).status).toBe(400);
      expect(new MeeshyError(ErrorCode.INTERNAL_ERROR).status).toBe(500);
    });
  });

  describe('toJSON', () => {
    it('should return StandardError object', () => {
      const details = { field: 'email' };
      const error = new MeeshyError(ErrorCode.VALIDATION_ERROR, 'Invalid email', details);
      const json = error.toJSON();

      expect(json.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(json.message).toBe('Invalid email');
      expect(json.status).toBe(400);
      expect(json.details).toEqual(details);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx errors', () => {
      expect(new MeeshyError(ErrorCode.NOT_FOUND).isClientError()).toBe(true);
      expect(new MeeshyError(ErrorCode.UNAUTHORIZED).isClientError()).toBe(true);
      expect(new MeeshyError(ErrorCode.VALIDATION_ERROR).isClientError()).toBe(true);
    });

    it('should return false for 5xx errors', () => {
      expect(new MeeshyError(ErrorCode.INTERNAL_ERROR).isClientError()).toBe(false);
      expect(new MeeshyError(ErrorCode.DATABASE_ERROR).isClientError()).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx errors', () => {
      expect(new MeeshyError(ErrorCode.INTERNAL_ERROR).isServerError()).toBe(true);
      expect(new MeeshyError(ErrorCode.DATABASE_ERROR).isServerError()).toBe(true);
      expect(new MeeshyError(ErrorCode.TRANSLATION_ERROR).isServerError()).toBe(true);
    });

    it('should return false for 4xx errors', () => {
      expect(new MeeshyError(ErrorCode.NOT_FOUND).isServerError()).toBe(false);
      expect(new MeeshyError(ErrorCode.UNAUTHORIZED).isServerError()).toBe(false);
    });
  });
});

describe('createError', () => {
  it('should create MeeshyError instance', () => {
    const error = createError(ErrorCode.NOT_FOUND);
    expect(error).toBeInstanceOf(MeeshyError);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('should pass all parameters correctly', () => {
    const details = { id: '123' };
    const error = createError(ErrorCode.USER_NOT_FOUND, 'User missing', details, 'fr');
    expect(error.message).toBe('User missing');
    expect(error.details).toEqual(details);
  });
});

describe('handleAsync', () => {
  it('should return result on successful operation', async () => {
    const result = await handleAsync(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('should re-throw MeeshyError as-is', async () => {
    const originalError = new MeeshyError(ErrorCode.NOT_FOUND);
    await expect(handleAsync(() => Promise.reject(originalError))).rejects.toBe(originalError);
  });

  it('should wrap regular Error in MeeshyError', async () => {
    const regularError = new Error('Something went wrong');
    await expect(
      handleAsync(() => Promise.reject(regularError))
    ).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      details: { originalError: 'Something went wrong' },
    });
  });

  it('should wrap non-Error in MeeshyError', async () => {
    await expect(
      handleAsync(() => Promise.reject('string error'))
    ).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      details: { originalError: 'string error' },
    });
  });

  it('should use custom error code', async () => {
    await expect(
      handleAsync(() => Promise.reject(new Error('DB error')), ErrorCode.DATABASE_ERROR)
    ).rejects.toMatchObject({
      code: ErrorCode.DATABASE_ERROR,
    });
  });

  it('should include context in details', async () => {
    await expect(
      handleAsync(() => Promise.reject(new Error('error')), ErrorCode.INTERNAL_ERROR, 'user-service')
    ).rejects.toMatchObject({
      details: {
        originalError: 'error',
        context: 'user-service',
      },
    });
  });
});

describe('logError', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log server errors (5xx)', () => {
    const error = new MeeshyError(ErrorCode.INTERNAL_ERROR);
    logError(error);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should NOT log client errors (4xx)', () => {
    const error = new MeeshyError(ErrorCode.NOT_FOUND);
    logError(error);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should always log unhandled errors', () => {
    const error = new Error('Unhandled error');
    logError(error);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should include context in log', () => {
    const error = new MeeshyError(ErrorCode.INTERNAL_ERROR);
    logError(error, 'test-context');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR'),
      expect.objectContaining({ context: 'test-context' })
    );
  });
});

describe('sendErrorResponse', () => {
  let mockReply: { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send MeeshyError response with correct status', () => {
    const error = new MeeshyError(ErrorCode.NOT_FOUND, 'Resource not found');
    sendErrorResponse(mockReply, error);

    expect(mockReply.status).toHaveBeenCalledWith(404);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Resource not found',
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('should include details in response when present', () => {
    const details = { field: 'email' };
    const error = new MeeshyError(ErrorCode.VALIDATION_ERROR, 'Invalid', details);
    sendErrorResponse(mockReply, error);

    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid',
      code: ErrorCode.VALIDATION_ERROR,
      details,
    });
  });

  it('should send generic 500 response for regular errors', () => {
    const error = new Error('Unknown error');
    sendErrorResponse(mockReply, error);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: ErrorMessages[ErrorCode.INTERNAL_ERROR].fr,
      code: ErrorCode.INTERNAL_ERROR,
    });
  });
});
