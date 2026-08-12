/**
 * custom-errors.ts — unit tests
 *
 * Covers: all error classes (statusCode, code, message, custom fields),
 * handlePrismaError (P2002/P2025/P2003/P2032/unknown),
 * errorHandler (BaseAppError, Prisma, Zod, unknown).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import {
  BaseAppError,
  AuthenticationError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  PermissionDeniedError,
  InsufficientPermissionsError,
  NotFoundError,
  UserNotFoundError,
  ConflictError,
  UserAlreadyExistsError,
  DuplicateEmailError,
  DuplicateUsernameError,
  ValidationError,
  InvalidInputError,
  UserLockedError,
  UserInactiveError,
  UserDeletedError,
  EmailNotVerifiedError,
  RateLimitError,
  TooManyLoginAttemptsError,
  TranslationError,
  InternalServerError,
  ServiceUnavailableError,
  handlePrismaError,
  errorHandler,
} from '../../../errors/custom-errors';

// ─── BaseAppError ─────────────────────────────────────────────────────────────

describe('BaseAppError', () => {
  it('sets statusCode, code, isOperational, and name', () => {
    const err = new BaseAppError('oops', 500, 'OOPS');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('OOPS');
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('BaseAppError');
    expect(err.message).toBe('oops');
  });

  it('isOperational defaults to true and can be overridden to false', () => {
    const operational = new BaseAppError('msg', 500, 'X');
    expect(operational.isOperational).toBe(true);

    const nonOperational = new BaseAppError('msg', 500, 'X', false);
    expect(nonOperational.isOperational).toBe(false);
  });

  it('is an instance of Error', () => {
    expect(new BaseAppError('m', 400, 'C')).toBeInstanceOf(Error);
  });
});

// ─── Authentication errors ─────────────────────────────────────────────────────

describe('AuthenticationError', () => {
  it('has statusCode 401, code AUTH_FAILED, default message', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.message).toContain('authentification');
  });

  it('accepts a custom message', () => {
    const err = new AuthenticationError('Token manquant');
    expect(err.message).toBe('Token manquant');
  });
});

describe('InvalidCredentialsError', () => {
  it('has statusCode 401, code INVALID_CREDENTIALS', () => {
    const err = new InvalidCredentialsError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('TokenExpiredError', () => {
  it('has statusCode 401, code TOKEN_EXPIRED', () => {
    const err = new TokenExpiredError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_EXPIRED');
  });
});

describe('TokenInvalidError', () => {
  it('has statusCode 401, code TOKEN_INVALID', () => {
    const err = new TokenInvalidError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_INVALID');
  });
});

// ─── Authorization errors ─────────────────────────────────────────────────────

describe('PermissionDeniedError', () => {
  it('has statusCode 403, code PERMISSION_DENIED', () => {
    const err = new PermissionDeniedError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('PERMISSION_DENIED');
  });
});

describe('InsufficientPermissionsError', () => {
  it('has statusCode 403, code INSUFFICIENT_PERMISSIONS', () => {
    const err = new InsufficientPermissionsError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

// ─── Resource errors ──────────────────────────────────────────────────────────

describe('NotFoundError', () => {
  it('constructs message with identifier when provided', () => {
    const err = new NotFoundError('User', 'abc123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('abc123');
  });

  it('constructs message without identifier', () => {
    const err = new NotFoundError('Conversation');
    expect(err.message).toContain('Conversation');
    expect(err.message).not.toContain('undefined');
  });

  it('accepts a custom code', () => {
    const err = new NotFoundError('Thing', undefined, 'THING_MISSING');
    expect(err.code).toBe('THING_MISSING');
  });
});

describe('UserNotFoundError', () => {
  it('extends NotFoundError with code USER_NOT_FOUND', () => {
    const err = new UserNotFoundError('u-1');
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.message).toContain('u-1');
  });

  it('works without identifier', () => {
    const err = new UserNotFoundError();
    expect(err.code).toBe('USER_NOT_FOUND');
  });
});

// ─── Conflict errors ──────────────────────────────────────────────────────────

describe('ConflictError', () => {
  it('has statusCode 409, default code CONFLICT', () => {
    const err = new ConflictError('Duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('accepts a custom code', () => {
    const err = new ConflictError('msg', 'MY_CONFLICT');
    expect(err.code).toBe('MY_CONFLICT');
  });
});

describe('UserAlreadyExistsError', () => {
  it('mentions email field', () => {
    const err = new UserAlreadyExistsError('email', 'test@example.com');
    expect(err.code).toBe('USER_ALREADY_EXISTS');
    expect(err.message).toContain('email');
  });

  it('mentions username field', () => {
    const err = new UserAlreadyExistsError('username', 'alice');
    expect(err.message).toContain('nom');
    expect(err.message).toContain('alice');
  });
});

describe('DuplicateEmailError', () => {
  it('mentions the email in the message', () => {
    const err = new DuplicateEmailError('a@b.com');
    expect(err.code).toBe('DUPLICATE_EMAIL');
    expect(err.message).toContain('a@b.com');
  });
});

describe('DuplicateUsernameError', () => {
  it('mentions the username in the message', () => {
    const err = new DuplicateUsernameError('bob');
    expect(err.code).toBe('DUPLICATE_USERNAME');
    expect(err.message).toContain('bob');
  });
});

// ─── Validation errors ────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('has statusCode 400, code VALIDATION_ERROR, and exposes errors map', () => {
    const err = new ValidationError('Bad input', { field: 'Required' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.errors).toEqual({ field: 'Required' });
  });

  it('defaults to empty errors map', () => {
    const err = new ValidationError('Bad input');
    expect(err.errors).toEqual({});
  });
});

describe('InvalidInputError', () => {
  it('wraps field + message into errors map', () => {
    const err = new InvalidInputError('email', 'Must be a valid email');
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.errors).toEqual({ email: 'Must be a valid email' });
  });
});

// ─── Account errors ───────────────────────────────────────────────────────────

describe('UserLockedError', () => {
  it('uses generic message when no lockedUntil date', () => {
    const err = new UserLockedError();
    expect(err.statusCode).toBe(423);
    expect(err.code).toBe('USER_LOCKED');
    expect(err.lockedUntil).toBeUndefined();
    expect(err.message).not.toContain('undefined');
  });

  it('includes formatted date when lockedUntil is provided', () => {
    const until = new Date('2030-01-01T12:00:00Z');
    const err = new UserLockedError(until);
    expect(err.lockedUntil).toBe(until);
    expect(err.message).toContain('2030');
  });
});

describe('UserInactiveError', () => {
  it('has statusCode 403, code USER_INACTIVE', () => {
    const err = new UserInactiveError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('USER_INACTIVE');
  });
});

describe('UserDeletedError', () => {
  it('has statusCode 410, code USER_DELETED', () => {
    const err = new UserDeletedError();
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('USER_DELETED');
  });
});

describe('EmailNotVerifiedError', () => {
  it('has statusCode 403, code EMAIL_NOT_VERIFIED', () => {
    const err = new EmailNotVerifiedError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

// ─── Rate limiting errors ─────────────────────────────────────────────────────

describe('RateLimitError', () => {
  it('has statusCode 429, exposes retryAfter, default code', () => {
    const err = new RateLimitError(60);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.retryAfter).toBe(60);
    expect(err.message).toContain('60');
  });

  it('accepts a custom message', () => {
    const err = new RateLimitError(30, 'Slow down');
    expect(err.message).toBe('Slow down');
  });

  it('accepts a custom code', () => {
    const err = new RateLimitError(0, undefined, 'CUSTOM_LIMIT');
    expect(err.code).toBe('CUSTOM_LIMIT');
  });
});

describe('TooManyLoginAttemptsError', () => {
  it('extends RateLimitError with code TOO_MANY_LOGIN_ATTEMPTS', () => {
    const err = new TooManyLoginAttemptsError(120);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe('TOO_MANY_LOGIN_ATTEMPTS');
    expect(err.retryAfter).toBe(120);
    expect(err.message).toContain('120');
  });
});

// ─── Translation & server errors ──────────────────────────────────────────────

describe('TranslationError', () => {
  it('has statusCode 500, code TRANSLATION_ERROR', () => {
    const err = new TranslationError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TRANSLATION_ERROR');
  });
});

describe('InternalServerError', () => {
  it('has statusCode 500, code INTERNAL_SERVER_ERROR, isOperational false by default', () => {
    const err = new InternalServerError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_SERVER_ERROR');
    expect(err.isOperational).toBe(false);
  });

  it('isOperational can be set to true', () => {
    const err = new InternalServerError('msg', true);
    expect(err.isOperational).toBe(true);
  });
});

describe('ServiceUnavailableError', () => {
  it('has statusCode 503, names the service in the message', () => {
    const err = new ServiceUnavailableError('Redis');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.message).toContain('Redis');
  });
});

// ─── handlePrismaError ────────────────────────────────────────────────────────

describe('handlePrismaError', () => {
  it('P2002 with email target → DuplicateEmailError', () => {
    const prismaErr = { code: 'P2002', meta: { target: ['email', 'test@x.com'] } };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(DuplicateEmailError);
    expect(err.statusCode).toBe(409);
  });

  it('P2002 with email target but no value → DuplicateEmailError with fallback', () => {
    // Covers the || 'email' fallback branch (target[1] is undefined)
    const prismaErr = { code: 'P2002', meta: { target: ['email'] } };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(DuplicateEmailError);
  });

  it('P2002 with username target → DuplicateUsernameError', () => {
    const prismaErr = { code: 'P2002', meta: { target: ['username', 'alice'] } };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(DuplicateUsernameError);
  });

  it('P2002 with username target but no value → DuplicateUsernameError with fallback', () => {
    // Covers the || 'username' fallback branch (target[1] is undefined)
    const prismaErr = { code: 'P2002', meta: { target: ['username'] } };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(DuplicateUsernameError);
  });

  it('P2002 with other field → ConflictError', () => {
    const prismaErr = { code: 'P2002', meta: { target: ['phone'] } };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('CONFLICT');
  });

  it('P2025 → NotFoundError', () => {
    const prismaErr = { code: 'P2025' };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
  });

  it('P2003 → ValidationError about foreign key', () => {
    const prismaErr = { code: 'P2003' };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
  });

  it('P2032 → ValidationError with field from meta', () => {
    const prismaErr = { code: 'P2032', meta: { field: 'name' }, message: 'too long' };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toHaveProperty('name');
  });

  it('P2032 fallback to "champ" when meta.field absent', () => {
    const prismaErr = { code: 'P2032', message: 'bad' };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toHaveProperty('champ');
  });

  it('unknown Prisma code → InternalServerError', () => {
    const prismaErr = { code: 'P9999' };
    const err = handlePrismaError(prismaErr);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.statusCode).toBe(500);
  });
});

// ─── errorHandler ─────────────────────────────────────────────────────────────

function makeReply() {
  let statusCode = 0;
  let body: unknown;
  const reply = {
    status: jest.fn((code: number) => { statusCode = code; return reply; }),
    send: jest.fn((b: unknown) => { body = b; return reply; }),
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
  return reply as any;
}

const mockRequest = {} as any;

describe('errorHandler', () => {
  it('handles BaseAppError: sends correct status and code', () => {
    const reply = makeReply();
    const err = new AuthenticationError('Bad token');
    errorHandler(err, mockRequest, reply);
    expect(reply.statusCode).toBe(401);
    expect((reply.body as any).error.code).toBe('AUTH_FAILED');
    expect((reply.body as any).error.message).toBe('Bad token');
    expect((reply.body as any).success).toBe(false);
  });

  it('includes errors map for ValidationError', () => {
    const reply = makeReply();
    const err = new ValidationError('Bad input', { email: 'Required' });
    errorHandler(err, mockRequest, reply);
    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).error.errors).toEqual({ email: 'Required' });
  });

  it('includes retryAfter for RateLimitError', () => {
    const reply = makeReply();
    const err = new RateLimitError(30);
    errorHandler(err, mockRequest, reply);
    expect(reply.statusCode).toBe(429);
    expect((reply.body as any).error.retryAfter).toBe(30);
  });

  it('includes lockedUntil for UserLockedError with date', () => {
    const reply = makeReply();
    const until = new Date('2030-06-01T00:00:00Z');
    const err = new UserLockedError(until);
    errorHandler(err, mockRequest, reply);
    expect(reply.statusCode).toBe(423);
    expect((reply.body as any).error.lockedUntil).toBe(until.toISOString());
  });

  it('omits lockedUntil for UserLockedError without date', () => {
    const reply = makeReply();
    const err = new UserLockedError();
    errorHandler(err, mockRequest, reply);
    expect((reply.body as any).error.lockedUntil).toBeUndefined();
  });

  it('handles PrismaClientKnownRequestError by converting to custom error', () => {
    const reply = makeReply();
    const prismaErr = Object.assign(new Error('prisma'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
    });
    errorHandler(prismaErr, mockRequest, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('handles ZodError by returning 400 with validation details', () => {
    const reply = makeReply();
    const zodErr = Object.assign(new Error('zod'), {
      name: 'ZodError',
      errors: [{ path: ['email'], message: 'Invalid email', code: 'invalid_string' }],
    });
    errorHandler(zodErr, mockRequest, reply);
    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('handles unknown Error: returns 500 with message in non-production', () => {
    const reply = makeReply();
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
    errorHandler(new Error('something broke'), mockRequest, reply);
    process.env['NODE_ENV'] = original;
    expect(reply.statusCode).toBe(500);
    expect((reply.body as any).error.message).toBe('something broke');
  });

  it('handles unknown Error: hides message in production', () => {
    const reply = makeReply();
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    errorHandler(new Error('internal detail'), mockRequest, reply);
    process.env['NODE_ENV'] = original;
    expect(reply.statusCode).toBe(500);
    expect((reply.body as any).error.message).not.toBe('internal detail');
  });
});
