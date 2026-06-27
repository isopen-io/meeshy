/**
 * Tests for services/phone-password-reset.service.ts
 *
 * Covers lookupByPhone, verifyIdentity, verifyCode, resendCode
 * and the private getErrorCode mapping
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`),
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

import { phonePasswordResetService } from '@/services/phone-password-reset.service';
import { buildApiUrl } from '@/lib/config';
import { logger } from '@/utils/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

const fail = (status: number, data: unknown = {}) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) });

describe('PhonePasswordResetService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockBuildApiUrl.mockImplementation((ep: string) => `http://localhost:3000/api/v1${ep}`);
  });

  // ─── lookupByPhone ────────────────────────────────────────────────────────

  describe('lookupByPhone', () => {
    it('returns response data on success', async () => {
      const payload = {
        success: true,
        tokenId: 'tok-abc',
        maskedUserInfo: { displayName: 'J***', username: 'j***', email: 'j***@***.com' },
      };
      mockFetch.mockReturnValueOnce(ok(payload));

      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678' });

      expect(result).toEqual(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password/phone/lookup'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends phone number in request body', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678', countryCode: 'FR' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.phoneNumber).toBe('+33612345678');
      expect(body.countryCode).toBe('FR');
    });

    it('returns known error code on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(404, { error: 'user_not_found' }));

      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('user_not_found');
    });

    it('maps unknown error codes to internal_error', async () => {
      mockFetch.mockReturnValueOnce(fail(500, { error: 'totally_unknown_code' }));

      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678' });

      expect(result.error).toBe('internal_error');
    });

    it('returns internal_error and logs on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('internal_error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('defaults to internal_error when no error field on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(500, {}));

      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+33612345678' });

      expect(result.error).toBe('internal_error');
    });
  });

  // ─── verifyIdentity ───────────────────────────────────────────────────────

  describe('verifyIdentity', () => {
    const req = { tokenId: 'tok-abc', fullUsername: 'john', fullEmail: 'john@example.com' };

    it('returns success response on match', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, codeSent: true, attemptsRemaining: 3 }));

      const result = await phonePasswordResetService.verifyIdentity(req);

      expect(result.success).toBe(true);
      expect(result.codeSent).toBe(true);
    });

    it('calls /auth/forgot-password/phone/verify-identity', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phonePasswordResetService.verifyIdentity(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password/phone/verify-identity'),
        expect.anything()
      );
    });

    it('returns error and attemptsRemaining on identity mismatch', async () => {
      mockFetch.mockReturnValueOnce(
        fail(400, { error: 'identity_mismatch', attemptsRemaining: 2 })
      );

      const result = await phonePasswordResetService.verifyIdentity(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('identity_mismatch');
      expect(result.attemptsRemaining).toBe(2);
    });

    it('maps unknown error code to internal_error', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'some_unknown_error' }));

      const result = await phonePasswordResetService.verifyIdentity(req);

      expect(result.error).toBe('internal_error');
    });

    it('returns internal_error on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await phonePasswordResetService.verifyIdentity(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('internal_error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── verifyCode ──────────────────────────────────────────────────────────

  describe('verifyCode', () => {
    const req = { tokenId: 'tok-abc', code: '123456' };

    it('returns resetToken on success', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, resetToken: 'reset-xyz' }));

      const result = await phonePasswordResetService.verifyCode(req);

      expect(result.success).toBe(true);
      expect(result.resetToken).toBe('reset-xyz');
    });

    it('calls /auth/forgot-password/phone/verify-code', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phonePasswordResetService.verifyCode(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password/phone/verify-code'),
        expect.anything()
      );
    });

    it('returns known error code on failure', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'invalid_code' }));

      const result = await phonePasswordResetService.verifyCode(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_code');
    });

    it('returns code_expired when code is expired', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'code_expired' }));

      const result = await phonePasswordResetService.verifyCode(req);

      expect(result.error).toBe('code_expired');
    });

    it('returns internal_error on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await phonePasswordResetService.verifyCode(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('internal_error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── resendCode ───────────────────────────────────────────────────────────

  describe('resendCode', () => {
    const req = { tokenId: 'tok-abc' };

    it('returns success on resend', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      const result = await phonePasswordResetService.resendCode(req);

      expect(result.success).toBe(true);
    });

    it('calls /auth/forgot-password/phone/resend', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phonePasswordResetService.resendCode(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password/phone/resend'),
        expect.anything()
      );
    });

    it('returns error on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(429, { error: 'rate_limited' }));

      const result = await phonePasswordResetService.resendCode(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('rate_limited');
    });

    it('returns sms_send_failed when SMS fails', async () => {
      mockFetch.mockReturnValueOnce(fail(500, { error: 'sms_send_failed' }));

      const result = await phonePasswordResetService.resendCode(req);

      expect(result.error).toBe('sms_send_failed');
    });

    it('returns internal_error on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await phonePasswordResetService.resendCode(req);

      expect(result.success).toBe(false);
      expect(result.error).toBe('internal_error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── getErrorCode (via public methods) ───────────────────────────────────

  describe('error code mapping', () => {
    const KNOWN_CODES = [
      'rate_limited', 'invalid_phone', 'user_not_found', 'phone_not_verified',
      'invalid_token', 'token_expired', 'invalid_step', 'max_attempts_exceeded',
      'identity_mismatch', 'sms_send_failed', 'code_expired', 'invalid_code',
      'validation_error', 'internal_error',
    ];

    it.each(KNOWN_CODES)('passes through known error code: %s', async (code) => {
      mockFetch.mockReturnValueOnce(fail(400, { error: code }));
      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+1' });
      expect(result.error).toBe(code);
    });

    it('maps any unknown code to internal_error', async () => {
      mockFetch.mockReturnValueOnce(fail(500, { error: 'mystery_error_xyz' }));
      const result = await phonePasswordResetService.lookupByPhone({ phoneNumber: '+1' });
      expect(result.error).toBe('internal_error');
    });
  });
});
