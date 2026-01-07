/**
 * EmailService Unit Tests - Multi-Provider Architecture with i18n
 *
 * Tests:
 * - Provider initialization with environment variables
 * - Multi-provider fallback mechanism
 * - i18n translations (fr, en, es, pt)
 * - Email verification sending
 * - Password reset email sending
 * - Password changed notification
 * - Security alert email sending
 * - Error handling and missing configuration warnings
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Store original environment variables
const originalEnv = { ...process.env };

// Mock axios for HTTP requests
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  default: {
    post: (...args: any[]) => mockAxiosPost(...args)
  }
}));

// Mock console methods to reduce test noise
let mockConsoleLog: jest.SpyInstance;
let mockConsoleError: jest.SpyInstance;
let mockConsoleWarn: jest.SpyInstance;

describe('EmailService', () => {
  let EmailService: typeof import('../../../services/EmailService').EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAxiosPost.mockReset();

    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset environment variables before each test
    process.env = { ...originalEnv };

    // Clear all provider keys by default
    delete process.env.BREVO_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;

    // Re-import the module to get fresh instance with new env vars
    jest.resetModules();
    const module = await import('../../../services/EmailService');
    EmailService = module.EmailService;
  });

  afterEach(() => {
    process.env = originalEnv;
    mockConsoleLog?.mockRestore();
    mockConsoleError?.mockRestore();
    mockConsoleWarn?.mockRestore();
  });

  // ==============================================
  // PROVIDER INITIALIZATION TESTS
  // ==============================================

  describe('Provider Initialization', () => {
    it('should warn when no providers are configured', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No email providers configured');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No providers configured'),
        'test@example.com'
      );
    });

    it('should initialize Brevo provider when API key is set', async () => {
      process.env.BREVO_API_KEY = 'test-brevo-key';

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'msg-123' } });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'test-brevo-key'
          })
        })
      );
    });

    it('should initialize SendGrid provider when API key is set', async () => {
      process.env.SENDGRID_API_KEY = 'test-sendgrid-key';

      mockAxiosPost.mockResolvedValueOnce({ data: {} });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-sendgrid-key'
          })
        })
      );
    });

    it('should initialize Mailgun provider when API key and domain are set', async () => {
      process.env.MAILGUN_API_KEY = 'test-mailgun-key';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';

      mockAxiosPost.mockResolvedValueOnce({ data: { id: 'msg-456' } });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mailgun');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/mg.example.com/messages',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should order providers by cost (Brevo first)', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.SENDGRID_API_KEY = 'sendgrid-key';
      process.env.MAILGUN_API_KEY = 'mailgun-key';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'msg-123' } });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      // Should use Brevo first (cheapest)
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // PROVIDER FALLBACK TESTS
  // ==============================================

  describe('Provider Fallback', () => {
    it('should fallback to SendGrid when Brevo fails', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.SENDGRID_API_KEY = 'sendgrid-key';

      // Brevo fails, SendGrid succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockResolvedValueOnce({ data: {} });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
    });

    it('should fallback to Mailgun when Brevo and SendGrid fail', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.SENDGRID_API_KEY = 'sendgrid-key';
      process.env.MAILGUN_API_KEY = 'mailgun-key';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';

      // Brevo and SendGrid fail, Mailgun succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockRejectedValueOnce(new Error('SendGrid API error'))
        .mockResolvedValueOnce({ data: { id: 'msg-789' } });

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('mailgun');
    });

    it('should return failure when all providers fail', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.SENDGRID_API_KEY = 'sendgrid-key';

      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockRejectedValueOnce(new Error('SendGrid API error'));

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('All providers failed'),
        'test@example.com'
      );
    });
  });

  // ==============================================
  // I18N TRANSLATION TESTS
  // ==============================================

  describe('i18n Translations', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-123' } });
    });

    it('should send French email by default', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Jean Dupont',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'fr'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Vérifiez')
        }),
        expect.any(Object)
      );
    });

    it('should send English email when language is en', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'John Doe',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'en'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Verify')
        }),
        expect.any(Object)
      );
    });

    it('should send Spanish email when language is es', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Juan Garcia',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'es'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Verifica')
        }),
        expect.any(Object)
      );
    });

    it('should send Portuguese email when language is pt', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Joao Silva',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'pt'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Verifique')
        }),
        expect.any(Object)
      );
    });

    it('should fallback to French for unsupported languages', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'de' // German - not supported
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Vérifiez') // Falls back to French
        }),
        expect.any(Object)
      );
    });

    it('should normalize language codes (en-US -> en)', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'test@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'en-US'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('Verify')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // EMAIL VERIFICATION TESTS
  // ==============================================

  describe('sendEmailVerification', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-123' } });
    });

    it('should send verification email successfully', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://app.meeshy.com/verify?token=abc123',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should include verification link in email content', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const verificationLink = 'https://app.meeshy.com/verify?token=unique-token-123';

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink,
        expiryHours: 24
      });

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.htmlContent).toContain(verificationLink);
      expect(body.textContent).toContain(verificationLink);
    });

    it('should include expiry hours in email content', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 48
      });

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.htmlContent).toContain('48');
    });
  });

  // ==============================================
  // PASSWORD RESET TESTS
  // ==============================================

  describe('sendPasswordReset', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-123' } });
    });

    it('should send password reset email successfully', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendPasswordReset({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://app.meeshy.com/reset?token=xyz',
        expiryMinutes: 30
      });

      expect(result.success).toBe(true);
    });

    it('should include reset link in email', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const resetLink = 'https://app.meeshy.com/reset?token=secret-token';

      await service.sendPasswordReset({
        to: 'user@example.com',
        name: 'Test User',
        resetLink,
        expiryMinutes: 30
      });

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.htmlContent).toContain(resetLink);
    });

    it('should send in user language', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendPasswordReset({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30,
        language: 'es'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: expect.stringContaining('contraseña')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // PASSWORD CHANGED TESTS
  // ==============================================

  describe('sendPasswordChanged', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-123' } });
    });

    it('should send password changed notification', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendPasswordChanged({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '192.168.1.100',
        location: 'Paris, France'
      });

      expect(result.success).toBe(true);
    });

    it('should include IP address in notification', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendPasswordChanged({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '10.0.0.1',
        location: 'New York, USA'
      });

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.htmlContent).toContain('10.0.0.1');
    });
  });

  // ==============================================
  // SECURITY ALERT TESTS
  // ==============================================

  describe('sendSecurityAlert', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-123' } });
    });

    it('should send security alert email', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      const result = await service.sendSecurityAlert({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Suspicious Login',
        details: 'Login from unknown location'
      });

      expect(result.success).toBe(true);
    });

    it('should include alert details in email', async () => {
      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      await service.sendSecurityAlert({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Multiple Failed Logins',
        details: '5 failed attempts from IP 192.168.1.50'
      });

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.htmlContent).toContain('Multiple Failed Logins');
      expect(body.htmlContent).toContain('5 failed attempts');
    });
  });

  // ==============================================
  // INTERFACE EXPORTS TESTS
  // ==============================================

  describe('Interface Exports', () => {
    it('should export EmailVerificationData interface', async () => {
      const module = await import('../../../services/EmailService');

      const data: import('../../../services/EmailService').EmailVerificationData = {
        to: 'test@example.com',
        name: 'Test',
        verificationLink: 'https://test.com',
        expiryHours: 24,
        language: 'fr'
      };

      expect(data.to).toBe('test@example.com');
      expect(data.language).toBe('fr');
    });

    it('should export PasswordResetEmailData interface', async () => {
      const data: import('../../../services/EmailService').PasswordResetEmailData = {
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com/reset',
        expiryMinutes: 30,
        language: 'en'
      };

      expect(data.expiryMinutes).toBe(30);
      expect(data.language).toBe('en');
    });

    it('should export EmailResult interface', async () => {
      const result: import('../../../services/EmailService').EmailResult = {
        success: true,
        provider: 'brevo',
        messageId: 'msg-123'
      };

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });
  });
});
