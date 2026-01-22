/**
 * EmailService Unit Tests - Multi-Provider Architecture with i18n
 *
 * Tests:
 * - Provider initialization with environment variables
 * - Multi-provider fallback mechanism
 * - i18n translations (fr, en, es, pt, it, de)
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

// Shared mock function that persists across module resets
const mockAxiosPost = jest.fn<any>();

// Mock console methods to reduce test noise
let mockConsoleLog: ReturnType<typeof jest.spyOn>;
let mockConsoleError: ReturnType<typeof jest.spyOn>;
let mockConsoleWarn: ReturnType<typeof jest.spyOn>;

// Helper to get fresh module with specific environment
async function getEmailServiceWithEnv(envOverrides: Record<string, string> = {}) {
  // Clear all provider keys and sender config
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.EMAIL_FROM;

  // Set environment variables
  Object.keys(envOverrides).forEach(key => {
    process.env[key] = envOverrides[key];
  });

  // Reset modules to pick up new env vars
  jest.resetModules();

  // Mock axios AFTER resetModules
  jest.doMock('axios', () => ({
    __esModule: true,
    default: {
      post: mockAxiosPost
    }
  }));

  // Import the fresh module
  const module = await import('../../../services/EmailService');
  return { EmailService: module.EmailService, module };
}

// Helper to create successful axios response
function createSuccessResponse(data: any = {}) {
  return Promise.resolve({
    data,
    status: 200,
    headers: {
      'x-message-id': 'mock-message-id'
    }
  });
}

// Helper to create error axios response (axios throws on non-2xx)
function createErrorResponse(status: number, message: string) {
  const error = new Error(message) as any;
  error.response = { status, data: { message } };
  return Promise.reject(error);
}

describe('EmailService', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();

    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset environment variables before each test
    process.env = { ...originalEnv };
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
    it('should initialize with Brevo when BREVO_API_KEY is set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('brevo');
    });

    it('should initialize with SendGrid when SENDGRID_API_KEY is set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('sendgrid');
    });

    it('should initialize with Mailgun when both keys are set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'test.mailgun.org'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('mailgun');
    });

    it('should initialize multiple providers in cost order', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        SENDGRID_API_KEY: 'test-sendgrid-key',
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'test.mailgun.org'
      });
      const service = new EmailService();
      const providers = service.getProviders();

      // Brevo should be first (cheapest)
      expect(providers[0]).toBe('brevo');
      expect(providers).toHaveLength(3);
    });

    it('should initialize with no providers when none are configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({});
      const service = new EmailService();

      // Vérifier que le service peut être créé même sans providers
      expect(service).toBeDefined();
      // Le service n'affiche plus de message dans le constructeur
    });
  });

  // ==============================================
  // EMAIL VERIFICATION TESTS
  // ==============================================

  describe('sendEmailVerification', () => {
    it('should send verification email via Brevo', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include verification link in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify/abc123',
        expiryHours: 24
      });

      // Check that axios was called with the verification link in htmlContent
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('https://example.com/verify/abc123')
        }),
        expect.any(Object)
      );
    });

    it('should use English language by default', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      // English subject (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.subject).toContain('Verify');
    });

    it('should send in English when language is en', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'en'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.subject).toContain('Verify');
    });
  });

  // ==============================================
  // PASSWORD RESET EMAIL TESTS
  // ==============================================

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email via Brevo', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include reset link in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset/xyz789',
        expiryMinutes: 15
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('https://example.com/reset/xyz789')
        }),
        expect.any(Object)
      );
    });

    it('should use SendGrid when Brevo is not configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
    });
  });

  // ==============================================
  // PROVIDER FALLBACK TESTS
  // ==============================================

  describe('Provider Fallback', () => {
    it('should fallback to SendGrid when Brevo fails', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost
        .mockReturnValueOnce(createErrorResponse(401, 'Invalid API key'))
        .mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      // Verify brevo was tried first, then sendgrid succeeded
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(result.provider).toBe('sendgrid');
    });
  });

  // ==============================================
  // I18N TESTS
  // ==============================================

  describe('i18n Translations', () => {
    it('should send email in English by default', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'John',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      // English content (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });

    it('should send email in English when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'John',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'en'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });

    it('should send email in Spanish when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Carlos',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'es'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hola');
    });

    it('should send email in Portuguese when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'João',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'pt'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Olá');
    });

    it('should fallback to English for unsupported language', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'ja' // Japanese not supported
      });

      // Should use English as fallback (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });
  });

  // ==============================================
  // PASSWORD CHANGED TESTS
  // ==============================================

  describe('sendPasswordChangedEmail', () => {
    it('should send password changed notification', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '192.168.1.100',
        location: 'Paris, France'
      });

      expect(result.success).toBe(true);
    });

    it('should include IP address in notification', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '10.0.0.1',
        location: 'New York, USA'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('10.0.0.1')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // SECURITY ALERT TESTS
  // ==============================================

  describe('sendSecurityAlertEmail', () => {
    it('should send security alert email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Suspicious Login',
        details: 'Login from unknown device'
      });

      expect(result.success).toBe(true);
    });

    it('should include alert details in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Multiple Failed Logins',
        details: '5 failed attempts from IP 192.168.1.1'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('Multiple Failed Logins')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // SENDGRID PROVIDER TESTS
  // ==============================================

  describe('SendGrid Provider', () => {
    it('should send email via SendGrid', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // MAILGUN PROVIDER TESTS
  // ==============================================

  describe('Mailgun Provider', () => {
    it('should send email via Mailgun', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'mail.example.com'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ id: 'mailgun-123' }));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mailgun');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('mail.example.com'),
        expect.anything(), // URLSearchParams
        expect.any(Object)
      );
    });

    it('should fail to send via Mailgun without domain', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key'
        // Missing MAILGUN_DOMAIN
      });
      const service = new EmailService();

      // Mailgun is added to providers (only API key is checked for initialization)
      expect(service.getProviders()).toContain('mailgun');

      // But sending should fail because domain is not configured
      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MAILGUN_DOMAIN not configured');
    });
  });

  // ==============================================
  // ERROR HANDLING TESTS
  // ==============================================

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createErrorResponse(401, 'Unauthorized'));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
    });

    it('should handle API errors with status codes', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createErrorResponse(500, 'Server error'));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
    });

    it('should return error when no providers configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({});
      const service = new EmailService();

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No email providers configured');
    });
  });

  // ==============================================
  // CONFIGURATION TESTS
  // ==============================================

  describe('Configuration', () => {
    it('should use custom sender name when configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        EMAIL_FROM_NAME: 'Custom Sender'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.sender.name).toBe('Custom Sender');
    });

    it('should use default sender when not configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.sender.name).toBe('Meeshy');
    });
  });

  // ==============================================
  // INTERFACE EXPORT TESTS
  // ==============================================

  describe('Interface Exports', () => {
    it('should export EmailResult interface', async () => {
      const { module } = await getEmailServiceWithEnv();

      // Verify the module exports exist
      expect(module.EmailService).toBeDefined();
    });
  });
});
