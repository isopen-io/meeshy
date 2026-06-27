/**
 * Tests for services/password-reset.service.ts
 *
 * Covers requestReset, resetPassword, verifyToken, validatePasswordStrength,
 * calculatePasswordStrength, getPasswordStrengthLabel, getPasswordStrengthColor
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import { passwordResetService } from '@/services/password-reset.service';
import { buildApiUrl } from '@/lib/config';
import { logger } from '@/utils/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;

describe('PasswordResetService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockBuildApiUrl.mockImplementation((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`);
  });

  describe('singleton', () => {
    it('returns the same instance on repeated calls', async () => {
      const { passwordResetService: a } = await import('@/services/password-reset.service');
      const { passwordResetService: b } = await import('@/services/password-reset.service');
      expect(a).toBe(b);
    });
  });

  describe('requestReset', () => {
    it('returns success with message on 200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Email sent' }),
      });

      const result = await passwordResetService.requestReset({ email: 'user@example.com' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email sent');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/forgot-password'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes captchaToken in body when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await passwordResetService.requestReset({ email: 'user@example.com', captchaToken: 'tok123' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.captchaToken).toBe('tok123');
    });

    it('omits captchaToken from body when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await passwordResetService.requestReset({ email: 'user@example.com' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).not.toHaveProperty('captchaToken');
    });

    it('falls back to default message when response has no message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await passwordResetService.requestReset({ email: 'user@example.com' });

      expect(result.message).toContain('If an account exists');
    });

    it('returns generic success even on fetch error (prevents enumeration)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await passwordResetService.requestReset({ email: 'user@example.com' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns success:false when backend says success false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Rate limited' }),
      });

      const result = await passwordResetService.requestReset({ email: 'user@example.com' });

      expect(result.success).toBe(false);
    });
  });

  describe('resetPassword', () => {
    const makeResetRequest = () => ({
      token: 'reset-token-abc',
      newPassword: 'NewPass123!',
      confirmPassword: 'NewPass123!',
    });

    it('returns success on successful reset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Password reset successfully' }),
      });

      const result = await passwordResetService.resetPassword(makeResetRequest());

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset successfully');
    });

    it('falls back to default success message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await passwordResetService.resetPassword(makeResetRequest());

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password reset successfully');
    });

    it('includes 2FA code in body when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await passwordResetService.resetPassword({ ...makeResetRequest(), twoFactorCode: '123456' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.twoFactorCode).toBe('123456');
    });

    it('returns failure on bad request response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'Token expired' }),
      });

      const result = await passwordResetService.resetPassword(makeResetRequest());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('falls back to default error message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false }),
      });

      const result = await passwordResetService.resetPassword(makeResetRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain('error occurred');
    });

    it('returns failure with network error message on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await passwordResetService.resetPassword(makeResetRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('verifyToken', () => {
    it('returns valid:true when token is valid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true, requires2FA: false }),
      });

      const result = await passwordResetService.verifyToken({ token: 'valid-token' });

      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.requires2FA).toBe(false);
    });

    it('includes requires2FA in response when set by backend', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true, requires2FA: true }),
      });

      const result = await passwordResetService.verifyToken({ token: 'valid-token' });

      expect(result.requires2FA).toBe(true);
    });

    it('defaults requires2FA to false when not present in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      const result = await passwordResetService.verifyToken({ token: 'valid-token' });

      expect(result.requires2FA).toBe(false);
    });

    it('appends token as query parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await passwordResetService.verifyToken({ token: 'my-special-token' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('token=my-special-token');
    });

    it('uses GET method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await passwordResetService.verifyToken({ token: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns valid:false when token is invalid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ valid: false, error: 'Token expired' }),
      });

      const result = await passwordResetService.verifyToken({ token: 'expired-token' });

      expect(result.success).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('falls back to default error when no error field present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ valid: false }),
      });

      const result = await passwordResetService.verifyToken({ token: 'bad-token' });

      expect(result.error).toContain('Invalid or expired');
    });

    it('returns failure on fetch exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await passwordResetService.verifyToken({ token: 'token' });

      expect(result.success).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validatePasswordStrength', () => {
    it('returns valid for a strong password', () => {
      const result = passwordResetService.validatePasswordStrength('StrongPass1');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports error for password shorter than 8 chars', () => {
      const result = passwordResetService.validatePasswordStrength('Short1');
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.isValid).toBe(false);
    });

    it('reports error when no lowercase letter', () => {
      const result = passwordResetService.validatePasswordStrength('NOLOWER123');
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('reports error when no uppercase letter', () => {
      const result = passwordResetService.validatePasswordStrength('noupper123');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('reports error when no digit', () => {
      const result = passwordResetService.validatePasswordStrength('NoDigitPass');
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('accumulates multiple errors', () => {
      const result = passwordResetService.validatePasswordStrength('short');
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('calculatePasswordStrength', () => {
    it('returns 0 for empty password', () => {
      expect(passwordResetService.calculatePasswordStrength('')).toBe(0);
    });

    it('returns low score for short simple password', () => {
      const score = passwordResetService.calculatePasswordStrength('abc');
      expect(score).toBeLessThan(2);
    });

    it('returns higher score for longer passwords', () => {
      // 'abcdefgh1' → len>=8 (+1), digit (+1) = 2
      const shortScore = passwordResetService.calculatePasswordStrength('abcdefgh1');
      // 'abcdefghijkl1' → len>=8 (+1), len>=12 (+1), digit (+1) = 3
      const longScore = passwordResetService.calculatePasswordStrength('abcdefghijkl1');
      expect(longScore).toBeGreaterThan(shortScore);
    });

    it('returns 4 for a very strong password', () => {
      const score = passwordResetService.calculatePasswordStrength('V3ryStr0ng!Pass#Word');
      expect(score).toBe(4);
    });

    it('caps at 4', () => {
      const score = passwordResetService.calculatePasswordStrength('ExtremelyLongAndComplexP@ss1234567890XYZ');
      expect(score).toBeLessThanOrEqual(4);
    });

    it('gives score for mixed case alone', () => {
      const score = passwordResetService.calculatePasswordStrength('AbcdefghIJK');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('getPasswordStrengthLabel', () => {
    it('returns Weak for score 0', () => {
      expect(passwordResetService.getPasswordStrengthLabel(0)).toBe('Weak');
    });

    it('returns Weak for score 1', () => {
      expect(passwordResetService.getPasswordStrengthLabel(1)).toBe('Weak');
    });

    it('returns Fair for score 2', () => {
      expect(passwordResetService.getPasswordStrengthLabel(2)).toBe('Fair');
    });

    it('returns Strong for score 3', () => {
      expect(passwordResetService.getPasswordStrengthLabel(3)).toBe('Strong');
    });

    it('returns Very Strong for score 4', () => {
      expect(passwordResetService.getPasswordStrengthLabel(4)).toBe('Very Strong');
    });

    it('returns Weak for unknown score', () => {
      expect(passwordResetService.getPasswordStrengthLabel(99)).toBe('Weak');
    });
  });

  describe('getPasswordStrengthColor', () => {
    it('returns red for score 0', () => {
      expect(passwordResetService.getPasswordStrengthColor(0)).toBe('bg-red-500');
    });

    it('returns red for score 1', () => {
      expect(passwordResetService.getPasswordStrengthColor(1)).toBe('bg-red-500');
    });

    it('returns yellow for score 2', () => {
      expect(passwordResetService.getPasswordStrengthColor(2)).toBe('bg-yellow-500');
    });

    it('returns blue for score 3', () => {
      expect(passwordResetService.getPasswordStrengthColor(3)).toBe('bg-blue-500');
    });

    it('returns green for score 4', () => {
      expect(passwordResetService.getPasswordStrengthColor(4)).toBe('bg-green-500');
    });

    it('returns gray for unknown score', () => {
      expect(passwordResetService.getPasswordStrengthColor(99)).toBe('bg-gray-300');
    });
  });
});
