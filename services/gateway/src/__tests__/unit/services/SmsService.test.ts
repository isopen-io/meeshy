/**
 * SmsService Unit Tests - Multi-Provider Architecture
 *
 * Tests:
 * - Provider initialization with environment variables
 * - Multi-provider fallback mechanism (Brevo -> Twilio -> Vonage)
 * - SMS sending for verification codes
 * - SMS sending for password reset codes
 * - SMS sending for login notifications
 * - Error handling and missing configuration warnings
 * - Development mode fallback (console logging)
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

describe('SmsService', () => {
  let SmsService: typeof import('../../../services/SmsService').SmsService;
  let smsService: import('../../../services/SmsService').SmsService;

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
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    delete process.env.VONAGE_API_KEY;
    delete process.env.VONAGE_API_SECRET;

    // Re-import the module to get fresh instance with new env vars
    jest.resetModules();
    const module = await import('../../../services/SmsService');
    SmsService = module.SmsService;
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
      const module = await import('../../../services/SmsService');
      new module.SmsService();

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No SMS providers configured')
      );
    });

    it('should fallback to DEV MODE when no providers configured', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('console');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('DEV MODE')
      );
    });

    it('should initialize Brevo provider when API key is set', async () => {
      process.env.BREVO_API_KEY = 'test-brevo-key';

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/transactionalSMS/sms',
        expect.objectContaining({
          recipient: '+33612345678',
          type: 'transactional'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'test-brevo-key'
          })
        })
      );
    });

    it('should initialize Twilio provider when credentials are set', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      mockAxiosPost.mockResolvedValueOnce({ data: { sid: 'SM123' } });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('api.twilio.com'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should initialize Vonage provider when credentials are set', async () => {
      process.env.VONAGE_API_KEY = 'vonage-key';
      process.env.VONAGE_API_SECRET = 'vonage-secret';

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          messages: [{ status: '0', 'message-id': 'msg-123' }]
        }
      });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('vonage');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://rest.nexmo.com/sms/json',
        expect.objectContaining({
          api_key: 'vonage-key',
          api_secret: 'vonage-secret'
        }),
        expect.any(Object)
      );
    });

    it('should order providers by cost (Brevo first, Twilio second, Vonage third)', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';
      process.env.VONAGE_API_KEY = 'vonage-key';
      process.env.VONAGE_API_SECRET = 'vonage-secret';

      mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'sms-123' } });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendVerificationCode('+33612345678', '123456');

      // Should use Brevo first (cheapest)
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/transactionalSMS/sms',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should log configured providers on initialization', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      new module.SmsService();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Initialized with'),
        expect.stringContaining('provider')
      );
    });
  });

  // ==============================================
  // PROVIDER FALLBACK TESTS
  // ==============================================

  describe('Provider Fallback', () => {
    it('should fallback to Twilio when Brevo fails', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      // Brevo fails, Twilio succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockResolvedValueOnce({ data: { sid: 'SM123' } });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
    });

    it('should fallback to Vonage when Brevo and Twilio fail', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';
      process.env.VONAGE_API_KEY = 'vonage-key';
      process.env.VONAGE_API_SECRET = 'vonage-secret';

      // Brevo and Twilio fail, Vonage succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockRejectedValueOnce(new Error('Twilio API error'))
        .mockResolvedValueOnce({
          data: { messages: [{ status: '0', 'message-id': 'msg-789' }] }
        });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(mockAxiosPost).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('vonage');
    });

    it('should return failure when all providers fail', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockRejectedValueOnce(new Error('Twilio API error'));

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('All SMS providers failed');
      expect(result.attemptedProviders).toContain('brevo');
      expect(result.attemptedProviders).toContain('twilio');
    });

    it('should track attempted providers in result', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      // Brevo fails, Twilio succeeds
      mockAxiosPost
        .mockRejectedValueOnce(new Error('Brevo API error'))
        .mockResolvedValueOnce({ data: { sid: 'SM123' } });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.attemptedProviders).toEqual(['brevo', 'twilio']);
    });
  });

  // ==============================================
  // VERIFICATION CODE SMS TESTS
  // ==============================================

  describe('sendVerificationCode', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'sms-123' } });
    });

    it('should send verification code SMS successfully', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should include code in SMS content', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendVerificationCode('+33612345678', '987654');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.content).toContain('987654');
    });

    it('should mention expiry in SMS content', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendVerificationCode('+33612345678', '123456');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.content).toContain('10 minutes');
    });
  });

  // ==============================================
  // PASSWORD RESET CODE SMS TESTS
  // ==============================================

  describe('sendPasswordResetCode', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'sms-123' } });
    });

    it('should send password reset code SMS', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendPasswordResetCode('+33612345678', '654321');

      expect(result.success).toBe(true);
    });

    it('should include reset code in SMS', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendPasswordResetCode('+33612345678', '111222');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.content).toContain('111222');
    });

    it('should mention 15 minute expiry', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendPasswordResetCode('+33612345678', '123456');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.content).toContain('15 minutes');
    });
  });

  // ==============================================
  // LOGIN NOTIFICATION SMS TESTS
  // ==============================================

  describe('sendLoginNotification', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'sms-123' } });
    });

    it('should send login notification SMS', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendLoginNotification('+33612345678', 'Paris, France');

      expect(result.success).toBe(true);
    });

    it('should include location in notification', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.sendLoginNotification('+33612345678', 'New York, USA');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.content).toContain('New York, USA');
    });

    it('should work without location', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendLoginNotification('+33612345678');

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // GENERIC SMS TESTS
  // ==============================================

  describe('send', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'test-brevo-key';
      mockAxiosPost.mockResolvedValue({ data: { messageId: 'sms-123' } });
    });

    it('should send generic SMS', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.send('+33612345678', 'Custom message content');

      expect(result.success).toBe(true);
    });

    it('should use custom sender when provided', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.send('+33612345678', 'Test message', 'CustomSender');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.sender).toBe('CustomSender');
    });

    it('should use default sender when not provided', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      await service.send('+33612345678', 'Test message');

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];

      expect(body.sender).toBe('Meeshy');
    });
  });

  // ==============================================
  // VONAGE ERROR HANDLING TESTS
  // ==============================================

  describe('Vonage Error Handling', () => {
    it('should handle Vonage error status', async () => {
      process.env.VONAGE_API_KEY = 'vonage-key';
      process.env.VONAGE_API_SECRET = 'vonage-secret';

      mockAxiosPost.mockResolvedValueOnce({
        data: {
          messages: [{ status: '1', 'error-text': 'Throttled' }]
        }
      });

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('All SMS providers failed');
    });
  });

  // ==============================================
  // TWILIO ERROR HANDLING TESTS
  // ==============================================

  describe('Twilio Error Handling', () => {
    it('should throw error when TWILIO_PHONE_NUMBER not configured', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      // No TWILIO_PHONE_NUMBER

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const result = await service.sendVerificationCode('+33612345678', '123456');

      // Should fail because TWILIO_PHONE_NUMBER is required
      expect(result.success).toBe(false);
    });
  });

  // ==============================================
  // UTILITY METHOD TESTS
  // ==============================================

  describe('getConfiguredProviders', () => {
    it('should return list of configured providers', async () => {
      process.env.BREVO_API_KEY = 'brevo-key';
      process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
      process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const providers = service.getConfiguredProviders();

      expect(providers).toContain('brevo');
      expect(providers).toContain('twilio');
      expect(providers).not.toContain('vonage');
    });

    it('should return empty array when no providers configured', async () => {
      jest.resetModules();
      const module = await import('../../../services/SmsService');
      const service = new module.SmsService();

      const providers = service.getConfiguredProviders();

      expect(providers).toEqual([]);
    });
  });
});
