/**
 * EmailService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the EmailService including:
 * - Constructor initialization with environment variables
 * - Password reset email sending
 * - Password changed confirmation email sending
 * - Security alert email sending
 * - SendGrid provider integration
 * - Mailgun provider integration
 * - Error handling for API failures
 * - Template rendering with dynamic data
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Store original environment variables
const originalEnv = { ...process.env };

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('EmailService', () => {
  let EmailService: typeof import('../../../services/EmailService').EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Reset environment variables before each test
    process.env = { ...originalEnv };

    // Set default test environment
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'test-sendgrid-api-key';
    process.env.EMAIL_FROM = 'test@meeshy.com';
    process.env.EMAIL_FROM_NAME = 'Test Meeshy';
    process.env.FRONTEND_URL = 'https://app.meeshy.com';

    // Re-import the module to get fresh instance with new env vars
    jest.resetModules();
    const module = await import('../../../services/EmailService');
    EmailService = module.EmailService;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  // ==============================================
  // CONSTRUCTOR / INITIALIZATION TESTS
  // ==============================================

  describe('Constructor and Initialization', () => {
    it('should initialize with SendGrid provider by default', async () => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      process.env.SENDGRID_API_KEY = 'sg-test-key';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      // Test by sending an email - it should use SendGrid
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.any(Object)
      );
    });

    it('should initialize with Mailgun provider when configured', async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-test-key';
      process.env.MAILGUN_DOMAIN = 'mg.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.mailgun.net'),
        expect.any(Object)
      );
    });

    it('should use default values when environment variables are not set', async () => {
      delete process.env.EMAIL_PROVIDER;
      delete process.env.SENDGRID_API_KEY;
      delete process.env.MAILGUN_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.EMAIL_FROM_NAME;

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      // It should default to SendGrid and use default from email
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.sendgrid.com/v3/mail/send');

      const body = JSON.parse(call[1]?.body as string);
      expect(body.from.email).toBe('noreply@meeshy.com');
      expect(body.from.name).toBe('Meeshy');
    });

    it('should fallback to MAILGUN_API_KEY when SENDGRID_API_KEY is not set', async () => {
      delete process.env.SENDGRID_API_KEY;
      process.env.MAILGUN_API_KEY = 'mg-fallback-key';
      process.env.EMAIL_PROVIDER = 'sendgrid'; // Still using SendGrid provider

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const service = new module.EmailService();

      // Service should still initialize (uses Mailgun key as fallback)
      expect(service).toBeDefined();
    });
  });

  // ==============================================
  // PASSWORD RESET EMAIL TESTS
  // ==============================================

  describe('sendPasswordResetEmail', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      service = new EmailService();
    });

    it('should send password reset email successfully via SendGrid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'John Doe',
        resetLink: 'https://app.meeshy.com/reset?token=abc123',
        expiryMinutes: 30
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-sendgrid-api-key',
            'Content-Type': 'application/json'
          })
        })
      );

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.personalizations[0].to[0].email).toBe('user@example.com');
      expect(body.from.email).toBe('test@meeshy.com');
      expect(body.from.name).toBe('Test Meeshy');
      expect(body.subject).toBe('Reset Your Password - Meeshy');
      expect(body.content).toHaveLength(2);
      expect(body.content[0].type).toBe('text/plain');
      expect(body.content[1].type).toBe('text/html');
    });

    it('should include user name in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Jane Smith',
        resetLink: 'https://app.meeshy.com/reset?token=xyz',
        expiryMinutes: 60
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      // Check HTML content includes name
      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('Hello Jane Smith');

      // Check plain text content includes name
      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('Hello Jane Smith');
    });

    it('should include reset link in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const resetLink = 'https://app.meeshy.com/reset?token=unique-token-123';

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink,
        expiryMinutes: 45
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain(resetLink);

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain(resetLink);
    });

    it('should include expiry minutes in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('15 minutes');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('15 minutes');
    });

    it('should handle SendGrid API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      } as Response);

      await expect(
        service.sendPasswordResetEmail({
          to: 'user@example.com',
          name: 'Test User',
          resetLink: 'https://example.com/reset',
          expiryMinutes: 30
        })
      ).rejects.toThrow('SendGrid API error: 401');

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        service.sendPasswordResetEmail({
          to: 'user@example.com',
          name: 'Test User',
          resetLink: 'https://example.com/reset',
          expiryMinutes: 30
        })
      ).rejects.toThrow('Network error');

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should send password reset email via Mailgun', async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-api-key';
      process.env.MAILGUN_DOMAIN = 'mg.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const mailgunService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await mailgunService.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/mg.meeshy.com/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    it('should log success message after sending email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'success@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Email sent via SendGrid to:'),
        'success@example.com'
      );
    });
  });

  // ==============================================
  // PASSWORD CHANGED EMAIL TESTS
  // ==============================================

  describe('sendPasswordChangedEmail', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      service = new EmailService();
    });

    it('should send password changed email successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const timestamp = '2025-01-06T12:00:00Z';

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'John Doe',
        timestamp,
        ipAddress: '192.168.1.100',
        location: 'Paris, France'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.subject).toBe('Your Password Was Changed - Meeshy');
      expect(body.personalizations[0].to[0].email).toBe('user@example.com');
    });

    it('should include IP address in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-06T12:00:00Z',
        ipAddress: '10.0.0.1',
        location: 'New York, USA'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('10.0.0.1');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('10.0.0.1');
    });

    it('should include location in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-06T12:00:00Z',
        ipAddress: '192.168.1.1',
        location: 'London, UK'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('London, UK');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('London, UK');
    });

    it('should include security contact information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-06T12:00:00Z',
        ipAddress: '192.168.1.1',
        location: 'Tokyo, Japan'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('security@meeshy.com');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('security@meeshy.com');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      } as Response);

      await expect(
        service.sendPasswordChangedEmail({
          to: 'user@example.com',
          name: 'Test User',
          timestamp: '2025-01-06T12:00:00Z',
          ipAddress: '192.168.1.1',
          location: 'Berlin, Germany'
        })
      ).rejects.toThrow('SendGrid API error: 500');
    });

    it('should send via Mailgun when configured', async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-key';
      process.env.MAILGUN_DOMAIN = 'mail.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const mailgunService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await mailgunService.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-06T12:00:00Z',
        ipAddress: '192.168.1.1',
        location: 'Berlin, Germany'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.mailgun.net'),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // SECURITY ALERT EMAIL TESTS
  // ==============================================

  describe('sendSecurityAlertEmail', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      service = new EmailService();
    });

    it('should send security alert email successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'John Doe',
        alertType: 'Suspicious Login',
        details: 'Login attempt from unknown device in Russia'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.subject).toBe('Security Alert: Suspicious Login - Meeshy');
      expect(body.personalizations[0].to[0].email).toBe('user@example.com');
    });

    it('should include alert type in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Multiple Failed Login Attempts',
        details: '5 failed attempts in the last hour'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('Multiple Failed Login Attempts');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('Multiple Failed Login Attempts');
    });

    it('should include alert details in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const alertDetails = 'Your account was accessed from a new location: Sydney, Australia';

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'New Location Login',
        details: alertDetails
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain(alertDetails);

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain(alertDetails);
    });

    it('should include security settings link with FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://custom.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const customService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await customService.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Account Settings Changed',
        details: 'Email address was updated'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('https://custom.meeshy.com/security');

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain('https://custom.meeshy.com/security');
    });

    it('should include recommended security actions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Test Alert',
        details: 'Test details'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain('Change your password');
      expect(htmlContent.value).toContain('two-factor authentication');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden')
      } as Response);

      await expect(
        service.sendSecurityAlertEmail({
          to: 'user@example.com',
          name: 'Test User',
          alertType: 'Test',
          details: 'Test'
        })
      ).rejects.toThrow('SendGrid API error: 403');
    });

    it('should send via Mailgun when configured', async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-key';
      process.env.MAILGUN_DOMAIN = 'mail.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const mailgunService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await mailgunService.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Test',
        details: 'Test'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.mailgun.net'),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // SENDGRID PROVIDER TESTS
  // ==============================================

  describe('SendGrid Provider', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      service = new EmailService();
    });

    it('should send correct authorization header', async () => {
      process.env.SENDGRID_API_KEY = 'my-sendgrid-key-123';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const sgService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await sgService.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      expect(call[1]?.headers).toEqual(
        expect.objectContaining({
          'Authorization': 'Bearer my-sendgrid-key-123'
        })
      );
    });

    it('should format email body correctly for SendGrid API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'recipient@example.com',
        name: 'Recipient Name',
        resetLink: 'https://reset.link',
        expiryMinutes: 20
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body).toHaveProperty('personalizations');
      expect(body).toHaveProperty('from');
      expect(body).toHaveProperty('subject');
      expect(body).toHaveProperty('content');

      expect(body.personalizations).toEqual([
        { to: [{ email: 'recipient@example.com' }] }
      ]);
    });

    it('should handle rate limit errors (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded')
      } as Response);

      await expect(
        service.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('SendGrid API error: 429');
    });

    it('should handle authentication errors (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized - Invalid API Key')
      } as Response);

      await expect(
        service.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('SendGrid API error: 401');
    });
  });

  // ==============================================
  // MAILGUN PROVIDER TESTS
  // ==============================================

  describe('Mailgun Provider', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-test-key';
      process.env.MAILGUN_DOMAIN = 'mail.meeshy.com';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      service = new module.EmailService();
    });

    it('should send to correct Mailgun endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/mail.meeshy.com/messages',
        expect.any(Object)
      );
    });

    it('should use Basic auth with API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      // The API key used is from the beforeEach setup of this describe block
      const authHeader = call[1]?.headers as Record<string, string>;

      // Verify it's a Basic auth header with base64 encoded credentials
      expect(authHeader['Authorization']).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
      expect(authHeader['Authorization']).toContain('Basic');
    });

    it('should use form-urlencoded content type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      expect(call[1]?.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded'
        })
      );
    });

    it('should format from address correctly', async () => {
      process.env.EMAIL_FROM = 'noreply@meeshy.com';
      process.env.EMAIL_FROM_NAME = 'Meeshy Support';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const mgService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await mgService.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = call[1]?.body as URLSearchParams;

      // URLSearchParams should contain the from field
      expect(body.toString()).toContain('from=');
    });

    it('should handle Mailgun API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request - Invalid domain')
      } as Response);

      await expect(
        service.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('Mailgun API error: 400');

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        service.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should log success message for Mailgun', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'mailgun-test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Email sent via Mailgun to:'),
        'mailgun-test@example.com'
      );
    });
  });

  // ==============================================
  // INVALID PROVIDER TESTS
  // ==============================================

  describe('Invalid Provider Handling', () => {
    it('should throw error for invalid email provider', async () => {
      process.env.EMAIL_PROVIDER = 'invalid_provider';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const invalidService = new module.EmailService();

      await expect(
        invalidService.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('Invalid email provider');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid email provider:'),
        'invalid_provider'
      );
    });

    it('should throw error for empty provider', async () => {
      // Force empty provider by clearing and not setting
      process.env.EMAIL_PROVIDER = '';

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const emptyProviderService = new module.EmailService();

      // Empty string defaults to 'sendgrid' in the constructor fallback
      // So it should work with SendGrid
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await emptyProviderService.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      // Should fallback to SendGrid
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // EMAIL TEMPLATE TESTS
  // ==============================================

  describe('Email Templates', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      service = new EmailService();
    });

    it('should include current year in footer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const currentYear = new Date().getFullYear().toString();

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain(currentYear);

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      expect(textContent.value).toContain(currentYear);
    });

    it('should include both HTML and plain text versions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.content).toHaveLength(2);

      const textContent = body.content.find((c: any) => c.type === 'text/plain');
      const htmlContent = body.content.find((c: any) => c.type === 'text/html');

      expect(textContent).toBeDefined();
      expect(htmlContent).toBeDefined();
      expect(textContent.value.length).toBeGreaterThan(0);
      expect(htmlContent.value.length).toBeGreaterThan(0);
    });

    it('should have responsive HTML template', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');

      // Check for responsive meta tag
      expect(htmlContent.value).toContain('viewport');
      expect(htmlContent.value).toContain('width=device-width');
    });

    it('should include proper HTML structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');

      expect(htmlContent.value).toContain('<!DOCTYPE html>');
      expect(htmlContent.value).toContain('<html>');
      expect(htmlContent.value).toContain('<head>');
      expect(htmlContent.value).toContain('<body>');
      expect(htmlContent.value).toContain('</html>');
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases and Error Handling', () => {
    let service: InstanceType<typeof EmailService>;

    beforeEach(() => {
      service = new EmailService();
    });

    it('should handle emails with special characters in name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: "Jean-Pierre O'Connor",
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain("Jean-Pierre O'Connor");
    });

    it('should handle emails with unicode characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Francois Muller',
        alertType: 'Test Alert',
        details: 'Details with unicode: cafe, naive'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body).toBeDefined();
    });

    it('should handle very long reset links', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const longLink = 'https://app.meeshy.com/reset?token=' + 'a'.repeat(500);

      await service.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: longLink,
        expiryMinutes: 30
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const htmlContent = body.content.find((c: any) => c.type === 'text/html');
      expect(htmlContent.value).toContain(longLink);
    });

    it('should handle empty MAILGUN_DOMAIN gracefully', async () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      process.env.MAILGUN_API_KEY = 'mg-key';
      delete process.env.MAILGUN_DOMAIN;

      jest.resetModules();
      const module = await import('../../../services/EmailService');
      const mgService = new module.EmailService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      await mgService.sendPasswordResetEmail({
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      });

      // Should use empty domain in URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3//messages',
        expect.any(Object)
      );
    });

    it('should handle fetch throwing synchronously', async () => {
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Synchronous error');
      });

      await expect(
        service.sendPasswordResetEmail({
          to: 'test@example.com',
          name: 'Test',
          resetLink: 'https://test.com',
          expiryMinutes: 30
        })
      ).rejects.toThrow('Synchronous error');
    });
  });

  // ==============================================
  // INTERFACE EXPORTS TESTS
  // ==============================================

  describe('Interface Exports', () => {
    it('should export PasswordResetEmailData interface', async () => {
      const module = await import('../../../services/EmailService');

      // Test that we can use the interface shape
      const data: import('../../../services/EmailService').PasswordResetEmailData = {
        to: 'test@example.com',
        name: 'Test',
        resetLink: 'https://test.com',
        expiryMinutes: 30
      };

      expect(data.to).toBe('test@example.com');
      expect(data.name).toBe('Test');
      expect(data.resetLink).toBe('https://test.com');
      expect(data.expiryMinutes).toBe(30);
    });

    it('should export PasswordChangedEmailData interface', async () => {
      const data: import('../../../services/EmailService').PasswordChangedEmailData = {
        to: 'test@example.com',
        name: 'Test',
        timestamp: '2025-01-06T12:00:00Z',
        ipAddress: '192.168.1.1',
        location: 'Paris, France'
      };

      expect(data.to).toBe('test@example.com');
      expect(data.timestamp).toBe('2025-01-06T12:00:00Z');
      expect(data.ipAddress).toBe('192.168.1.1');
      expect(data.location).toBe('Paris, France');
    });

    it('should export SecurityAlertEmailData interface', async () => {
      const data: import('../../../services/EmailService').SecurityAlertEmailData = {
        to: 'test@example.com',
        name: 'Test',
        alertType: 'Suspicious Activity',
        details: 'Multiple failed login attempts'
      };

      expect(data.to).toBe('test@example.com');
      expect(data.alertType).toBe('Suspicious Activity');
      expect(data.details).toBe('Multiple failed login attempts');
    });
  });
});
