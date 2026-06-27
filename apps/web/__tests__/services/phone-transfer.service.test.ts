/**
 * Tests for services/phone-transfer.service.ts
 *
 * Covers all 6 methods: initiateTransfer, initiateTransferForRegistration,
 * verifyTransferForRegistration, verifyAndTransfer, resendCode, cancelTransfer
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((ep: string) => `http://localhost:3000/api/v1${ep}`),
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

import { phoneTransferService } from '@/services/phone-transfer.service';
import { buildApiUrl } from '@/lib/config';
import { logger } from '@/utils/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

const fail = (status: number, data: unknown = {}) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) });

describe('PhoneTransferService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockBuildApiUrl.mockImplementation((ep: string) => `http://localhost:3000/api/v1${ep}`);
  });

  // ─── initiateTransfer ─────────────────────────────────────────────────────

  describe('initiateTransfer', () => {
    const req = { newUserId: 'user-123', phoneNumber: '+33612345678', phoneCountryCode: 'FR' };

    it('returns transferId and maskedOwnerInfo on success', async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          success: true,
          data: {
            transferId: 'xfer-abc',
            maskedOwnerInfo: { displayName: 'J***', username: 'j***', email: 'j***@**' },
          },
        })
      );

      const result = await phoneTransferService.initiateTransfer(req);

      expect(result.success).toBe(true);
      expect(result.transferId).toBe('xfer-abc');
      expect(result.maskedOwnerInfo?.displayName).toBe('J***');
    });

    it('calls /auth/phone-transfer/initiate with POST', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: {} }));

      await phoneTransferService.initiateTransfer(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/initiate'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('returns localized error on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(429, { error: 'rate_limited' }));

      const result = await phoneTransferService.initiateTransfer(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trop de tentatives');
    });

    it('returns internal_error message for unknown error codes', async () => {
      mockFetch.mockReturnValueOnce(fail(500, { error: 'unknown_xyz' }));

      const result = await phoneTransferService.initiateTransfer(req);

      expect(result.error).toContain('Une erreur est survenue');
    });

    it('returns failure when success is false in response body', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: false, error: 'internal_error' }));

      const result = await phoneTransferService.initiateTransfer(req);

      expect(result.success).toBe(false);
    });

    it('logs error and returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await phoneTransferService.initiateTransfer(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Une erreur');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── initiateTransferForRegistration ─────────────────────────────────────

  describe('initiateTransferForRegistration', () => {
    const req = {
      phoneNumber: '+33612345678',
      phoneCountryCode: 'FR',
      pendingUsername: 'newuser',
      pendingEmail: 'new@example.com',
    };

    it('returns transferId on success', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: { transferId: 'reg-xfer-abc' } }));

      const result = await phoneTransferService.initiateTransferForRegistration(req);

      expect(result.success).toBe(true);
      expect(result.transferId).toBe('reg-xfer-abc');
    });

    it('calls /auth/phone-transfer/initiate-registration', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: {} }));

      await phoneTransferService.initiateTransferForRegistration(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/initiate-registration'),
        expect.anything()
      );
    });

    it('returns error on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'validation_error' }));

      const result = await phoneTransferService.initiateTransferForRegistration(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Données invalides');
    });

    it('returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await phoneTransferService.initiateTransferForRegistration(req);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── verifyTransferForRegistration ───────────────────────────────────────

  describe('verifyTransferForRegistration', () => {
    const req = { transferId: 'reg-xfer-abc', code: '654321' };

    it('returns verified and transferToken on success', async () => {
      mockFetch.mockReturnValueOnce(
        ok({ success: true, data: { verified: true, transferToken: 'xfer-tok-xyz' } })
      );

      const result = await phoneTransferService.verifyTransferForRegistration(req);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.transferToken).toBe('xfer-tok-xyz');
    });

    it('calls /auth/phone-transfer/verify-registration', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: {} }));

      await phoneTransferService.verifyTransferForRegistration(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/verify-registration'),
        expect.anything()
      );
    });

    it('returns invalid_code error when code is wrong', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'invalid_code' }));

      const result = await phoneTransferService.verifyTransferForRegistration(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code invalide');
    });

    it('returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await phoneTransferService.verifyTransferForRegistration(req);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── verifyAndTransfer ────────────────────────────────────────────────────

  describe('verifyAndTransfer', () => {
    const req = { transferId: 'xfer-abc', code: '123456' };

    it('returns transferred:true on success', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: { transferred: true } }));

      const result = await phoneTransferService.verifyAndTransfer(req);

      expect(result.success).toBe(true);
      expect(result.transferred).toBe(true);
    });

    it('calls /auth/phone-transfer/verify', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true, data: {} }));

      await phoneTransferService.verifyAndTransfer(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/verify'),
        expect.anything()
      );
    });

    it('returns max_attempts_exceeded error', async () => {
      mockFetch.mockReturnValueOnce(fail(400, { error: 'max_attempts_exceeded' }));

      const result = await phoneTransferService.verifyAndTransfer(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trop de tentatives');
    });

    it('returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network'));

      const result = await phoneTransferService.verifyAndTransfer(req);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── resendCode ───────────────────────────────────────────────────────────

  describe('resendCode', () => {
    const req = { transferId: 'xfer-abc' };

    it('returns success on resend', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      const result = await phoneTransferService.resendCode(req);

      expect(result.success).toBe(true);
    });

    it('calls /auth/phone-transfer/resend', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phoneTransferService.resendCode(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/resend'),
        expect.anything()
      );
    });

    it('returns sms_send_failed error on SMS failure', async () => {
      mockFetch.mockReturnValueOnce(fail(500, { error: 'sms_send_failed' }));

      const result = await phoneTransferService.resendCode(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain("d'envoyer le SMS");
    });

    it('returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await phoneTransferService.resendCode(req);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── cancelTransfer ───────────────────────────────────────────────────────

  describe('cancelTransfer', () => {
    const req = { transferId: 'xfer-abc' };

    it('returns success:true when cancelled', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      const result = await phoneTransferService.cancelTransfer(req);

      expect(result.success).toBe(true);
    });

    it('calls /auth/phone-transfer/cancel', async () => {
      mockFetch.mockReturnValueOnce(ok({ success: true }));

      await phoneTransferService.cancelTransfer(req);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/phone-transfer/cancel'),
        expect.anything()
      );
    });

    it('returns success:false on HTTP failure', async () => {
      mockFetch.mockReturnValueOnce(fail(404, { success: false }));

      const result = await phoneTransferService.cancelTransfer(req);

      expect(result.success).toBe(false);
    });

    it('returns success:false on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await phoneTransferService.cancelTransfer(req);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ─── Error message mapping ────────────────────────────────────────────────

  describe('error message localization', () => {
    const errorCases: [string, string][] = [
      ['rate_limited', 'Trop de tentatives'],
      ['phone_not_found', "n'est plus associé"],
      ['transfer_expired', 'a expiré'],
      ['max_attempts_exceeded', 'Trop de tentatives'],
      ['invalid_code', 'Code invalide'],
      ['sms_send_failed', "d'envoyer le SMS"],
      ['internal_error', 'Une erreur est survenue'],
      ['validation_error', 'Données invalides'],
    ];

    it.each(errorCases)('translates %s error code correctly', async (code, expectedText) => {
      mockFetch.mockReturnValueOnce(fail(400, { error: code }));
      const result = await phoneTransferService.initiateTransfer({
        newUserId: 'u',
        phoneNumber: '+1',
        phoneCountryCode: 'US',
      });
      expect(result.error).toContain(expectedText);
    });
  });
});
