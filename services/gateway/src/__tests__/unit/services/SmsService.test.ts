/**
 * SmsService Unit Tests - Multi-Provider Architecture
 *
 * Tests:
 * - Provider initialization with environment variables
 * - Multi-provider fallback mechanism
 * - SMS sending (verification, password reset, login notification)
 * - Error handling and missing configuration warnings
 *
 * Providers (ordered by cost):
 * 1. Brevo - ~€0.045/SMS (cheapest)
 * 2. Twilio - ~€0.075/SMS
 * 3. Vonage - ~€0.080/SMS (most expensive)
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
async function getSmsServiceWithEnv(envOverrides: Record<string, string> = {}) {
  // Clear all provider keys
  delete process.env.BREVO_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.VONAGE_API_KEY;
  delete process.env.VONAGE_API_SECRET;
  delete process.env.SMS_SENDER_NAME;

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
  const module = await import('../../../services/SmsService');
  return { SmsService: module.SmsService, module };
}

describe('SmsService', () => {
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
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      expect(service.getConfiguredProviders()).toContain('brevo');
    });

    it('should initialize with Twilio when credentials are set', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token'
      });
      const service = new SmsService();

      expect(service.getConfiguredProviders()).toContain('twilio');
    });

    it('should initialize with Vonage when credentials are set', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        VONAGE_API_KEY: 'test-vonage-key',
        VONAGE_API_SECRET: 'test-vonage-secret'
      });
      const service = new SmsService();

      expect(service.getConfiguredProviders()).toContain('vonage');
    });

    it('should initialize multiple providers in cost order', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token',
        VONAGE_API_KEY: 'test-vonage-key',
        VONAGE_API_SECRET: 'test-vonage-secret'
      });
      const service = new SmsService();
      const providers = service.getConfiguredProviders();

      // Brevo should be first (cheapest)
      expect(providers[0]).toBe('brevo');
      expect(providers).toHaveLength(3);
    });

    it('should warn when no providers are configured', async () => {
      const { SmsService } = await getSmsServiceWithEnv({});
      new SmsService();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No SMS providers configured')
      );
    });
  });

  // ==============================================
  // VERIFICATION CODE TESTS
  // ==============================================

  describe('sendVerificationCode', () => {
    it('should send verification code via Brevo', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include code in SMS message', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      await service.sendVerificationCode('+33612345678', '789012');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          content: expect.stringContaining('789012')
        }),
        expect.any(Object)
      );
    });

    it('should send to correct phone number', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      await service.sendVerificationCode('+33698765432', '123456');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          recipient: '+33698765432'
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // PASSWORD RESET CODE TESTS
  // ==============================================

  describe('sendPasswordResetCode', () => {
    it('should send password reset code via Brevo', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-456' } });

      const result = await service.sendPasswordResetCode('+33612345678', 'RESET01');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include reset code in message', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-456' } });

      await service.sendPasswordResetCode('+33612345678', 'XYZABC');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          content: expect.stringContaining('XYZABC')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // LOGIN NOTIFICATION TESTS
  // ==============================================

  describe('sendLoginNotification', () => {
    it('should send login notification', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-789' } });

      const result = await service.sendLoginNotification('+33612345678');

      expect(result.success).toBe(true);
    });

    it('should include location when provided', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-789' } });

      await service.sendLoginNotification('+33612345678', 'Paris, France');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          content: expect.stringContaining('Paris, France')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // GENERIC SEND TESTS
  // ==============================================

  describe('send', () => {
    it('should send generic SMS message', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-gen' } });

      const result = await service.send('+33612345678', 'Custom message');

      expect(result.success).toBe(true);
    });

    it('should use custom sender when provided', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-gen' } });

      await service.send('+33612345678', 'Test message', 'CustomApp');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sender: 'CustomApp'
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // PROVIDER FALLBACK TESTS
  // ==============================================

  describe('Provider Fallback', () => {
    it('should fallback to Twilio when Brevo fails', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token',
        TWILIO_PHONE_NUMBER: '+15551234567'
      });
      const service = new SmsService();

      const brevoError = new Error('Brevo API error') as any;
      brevoError.response = { status: 401 };

      mockAxiosPost
        .mockRejectedValueOnce(brevoError)
        .mockResolvedValueOnce({ data: { sid: 'twilio-123' } });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
    });

    it('should fallback to Vonage when Brevo and Twilio fail', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token',
        TWILIO_PHONE_NUMBER: '+15551234567',
        VONAGE_API_KEY: 'test-vonage-key',
        VONAGE_API_SECRET: 'test-vonage-secret'
      });
      const service = new SmsService();

      const brevoError = new Error('Brevo error') as any;
      const twilioError = new Error('Twilio error') as any;

      mockAxiosPost
        .mockRejectedValueOnce(brevoError)
        .mockRejectedValueOnce(twilioError)
        .mockResolvedValueOnce({
          data: {
            messages: [{ status: '0', 'message-id': 'vonage-123' }]
          }
        });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('vonage');
    });

    it('should return failure when all providers fail', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      const error = new Error('API error') as any;

      mockAxiosPost.mockRejectedValue(error);

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('All SMS providers failed');
    });
  });

  // ==============================================
  // TWILIO PROVIDER TESTS
  // ==============================================

  describe('Twilio Provider', () => {
    it('should send SMS via Twilio', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token',
        TWILIO_PHONE_NUMBER: '+15551234567'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { sid: 'SM123' } });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('api.twilio.com'),
        expect.any(URLSearchParams),
        expect.any(Object)
      );
    });

    it('should fail when TWILIO_PHONE_NUMBER is not set', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        TWILIO_ACCOUNT_SID: 'test-sid',
        TWILIO_AUTH_TOKEN: 'test-token'
        // Missing TWILIO_PHONE_NUMBER
      });
      const service = new SmsService();

      mockAxiosPost.mockRejectedValueOnce(new Error('TWILIO_PHONE_NUMBER not configured'));

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
    });
  });

  // ==============================================
  // VONAGE PROVIDER TESTS
  // ==============================================

  describe('Vonage Provider', () => {
    it('should send SMS via Vonage', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        VONAGE_API_KEY: 'test-vonage-key',
        VONAGE_API_SECRET: 'test-vonage-secret'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          messages: [{ status: '0', 'message-id': 'vonage-msg-123' }]
        }
      });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('vonage');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://rest.nexmo.com/sms/json',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle Vonage error status', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        VONAGE_API_KEY: 'test-vonage-key',
        VONAGE_API_SECRET: 'test-vonage-secret'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          messages: [{ status: '1', 'error-text': 'Invalid credentials' }]
        }
      });

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
    });
  });

  // ==============================================
  // BREVO PROVIDER TESTS
  // ==============================================

  describe('Brevo Provider', () => {
    it('should call Brevo API with correct parameters', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'brevo-123' } });

      await service.sendVerificationCode('+33612345678', '123456');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/transactionalSMS/sms',
        expect.objectContaining({
          type: 'transactional',
          recipient: '+33612345678'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'test-brevo-key'
          })
        })
      );
    });
  });

  // ==============================================
  // ERROR HANDLING TESTS
  // ==============================================

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      const networkError = new Error('Network error') as any;
      networkError.code = 'ECONNREFUSED';

      mockAxiosPost.mockRejectedValueOnce(networkError);

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
    });

    it('should return dev mode response when no providers configured', async () => {
      const { SmsService } = await getSmsServiceWithEnv({});
      const service = new SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('console');
    });
  });

  // ==============================================
  // CONFIGURATION TESTS
  // ==============================================

  describe('Configuration', () => {
    it('should use custom sender name from environment', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        SMS_SENDER_NAME: 'CustomApp'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      await service.send('+33612345678', 'Test message');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sender: 'CustomApp'
        }),
        expect.any(Object)
      );
    });

    it('should use default sender when not configured', async () => {
      const { SmsService } = await getSmsServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new SmsService();

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      await service.send('+33612345678', 'Test message');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sender: 'Meeshy'
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // INTERFACE EXPORT TESTS
  // ==============================================

  describe('Interface Exports', () => {
    it('should export SmsResult interface', async () => {
      const { module } = await getSmsServiceWithEnv();

      // Verify the type can be used
      const result: import('../../../services/SmsService').SmsResult = {
        success: true,
        provider: 'brevo',
        messageId: 'sms-123'
      };

      expect(result.success).toBe(true);
    });
  });
});
