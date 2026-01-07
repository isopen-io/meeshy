/**
 * Multi-Provider SMS Service
 *
 * Providers ordered by cost (cheapest first):
 * 1. Brevo - ~€0.045/SMS (cheapest)
 * 2. Twilio - ~€0.075/SMS
 * 3. Vonage - ~€0.080/SMS (most expensive)
 *
 * Automatic fallback to next provider on failure.
 */

import axios from 'axios';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface SmsData {
  to: string;
  message: string;
  sender?: string;
}

export interface SmsResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  attemptedProviders?: string[];
}

interface SmsProviderConfig {
  name: 'brevo' | 'twilio' | 'vonage';
  enabled: boolean;
  priority: number;
  // Brevo
  apiKey?: string;
  // Twilio
  accountSid?: string;
  authToken?: string;
  // Vonage
  vonageApiKey?: string;
  vonageApiSecret?: string;
}

interface SmsProvider {
  name: string;
  send: (data: SmsData) => Promise<{ messageId?: string }>;
}

// ============================================================================
// SMS Service Class
// ============================================================================

export class SmsService {
  private providers: SmsProviderConfig[] = [];
  private defaultSender: string;

  constructor() {
    this.defaultSender = process.env.SMS_SENDER_NAME || 'Meeshy';
    this.initializeProviders();
  }

  /**
   * Initialize providers ordered by cost (cheapest first)
   */
  private initializeProviders(): void {
    // Priority 1: Brevo (cheapest - ~€0.045/SMS)
    if (process.env.BREVO_API_KEY) {
      this.providers.push({
        name: 'brevo',
        apiKey: process.env.BREVO_API_KEY,
        enabled: true,
        priority: 1,
      });
    }

    // Priority 2: Twilio (~€0.075/SMS)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.providers.push({
        name: 'twilio',
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        enabled: true,
        priority: 2,
      });
    }

    // Priority 3: Vonage (most expensive - ~€0.080/SMS)
    if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
      this.providers.push({
        name: 'vonage',
        vonageApiKey: process.env.VONAGE_API_KEY,
        vonageApiSecret: process.env.VONAGE_API_SECRET,
        enabled: true,
        priority: 3,
      });
    }

    // Sort by priority (lowest = cheapest = first)
    this.providers.sort((a, b) => a.priority - b.priority);

    if (this.providers.length === 0) {
      console.warn('[SmsService] No SMS providers configured. SMS sending will fail.');
    } else {
      console.log(`[SmsService] Initialized with ${this.providers.length} provider(s): ${this.providers.map(p => p.name).join(', ')}`);
    }
  }

  /**
   * Get a provider implementation by config
   */
  private getProvider(config: SmsProviderConfig): SmsProvider {
    switch (config.name) {
      case 'brevo':
        return this.createBrevoProvider(config);
      case 'twilio':
        return this.createTwilioProvider(config);
      case 'vonage':
        return this.createVonageProvider(config);
      default:
        throw new Error(`Unknown SMS provider: ${config.name}`);
    }
  }

  // ============================================================================
  // Provider Implementations
  // ============================================================================

  /**
   * Brevo SMS Provider (Transactional SMS API)
   * Docs: https://developers.brevo.com/reference/sendtransacsms
   */
  private createBrevoProvider(config: SmsProviderConfig): SmsProvider {
    return {
      name: 'brevo',
      send: async (data: SmsData) => {
        const response = await axios.post(
          'https://api.brevo.com/v3/transactionalSMS/sms',
          {
            sender: data.sender || this.defaultSender,
            recipient: data.to,
            content: data.message,
            type: 'transactional',
          },
          {
            headers: {
              'api-key': config.apiKey!,
              'Content-Type': 'application/json',
            },
          }
        );
        return { messageId: response.data.messageId?.toString() };
      },
    };
  }

  /**
   * Twilio SMS Provider
   * Docs: https://www.twilio.com/docs/sms/api/message-resource
   */
  private createTwilioProvider(config: SmsProviderConfig): SmsProvider {
    return {
      name: 'twilio',
      send: async (data: SmsData) => {
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
        if (!twilioFrom) {
          throw new Error('TWILIO_PHONE_NUMBER not configured');
        }

        const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

        const response = await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
          new URLSearchParams({
            To: data.to,
            From: twilioFrom,
            Body: data.message,
          }),
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );
        return { messageId: response.data.sid };
      },
    };
  }

  /**
   * Vonage (Nexmo) SMS Provider
   * Docs: https://developer.vonage.com/en/messaging/sms/overview
   */
  private createVonageProvider(config: SmsProviderConfig): SmsProvider {
    return {
      name: 'vonage',
      send: async (data: SmsData) => {
        const response = await axios.post(
          'https://rest.nexmo.com/sms/json',
          {
            api_key: config.vonageApiKey,
            api_secret: config.vonageApiSecret,
            from: data.sender || this.defaultSender,
            to: data.to,
            text: data.message,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        // Vonage returns messages array with status
        const messages = response.data.messages;
        if (messages && messages[0]) {
          if (messages[0].status !== '0') {
            throw new Error(`Vonage error: ${messages[0]['error-text'] || 'Unknown error'}`);
          }
          return { messageId: messages[0]['message-id'] };
        }
        return { messageId: undefined };
      },
    };
  }

  // ============================================================================
  // Core Send Method with Fallback
  // ============================================================================

  /**
   * Send SMS with automatic fallback between providers
   */
  private async sendSms(data: SmsData): Promise<SmsResult> {
    const attemptedProviders: string[] = [];

    if (this.providers.length === 0) {
      // Development fallback - log to console
      console.log('[SmsService] DEV MODE - No providers configured');
      console.log(`[SmsService] Would send SMS to: ${data.to}`);
      console.log(`[SmsService] Message: ${data.message}`);
      return {
        success: true,
        provider: 'console',
        messageId: `dev-${Date.now()}`,
        attemptedProviders: ['console'],
      };
    }

    for (const providerConfig of this.providers) {
      if (!providerConfig.enabled) continue;

      attemptedProviders.push(providerConfig.name);
      const provider = this.getProvider(providerConfig);

      try {
        console.log(`[SmsService] Attempting to send SMS via ${provider.name}...`);
        const result = await provider.send(data);

        console.log(`[SmsService] SMS sent successfully via ${provider.name}`);
        return {
          success: true,
          provider: provider.name,
          messageId: result.messageId,
          attemptedProviders,
        };
      } catch (error: any) {
        console.error(`[SmsService] ${provider.name} failed:`, error.message);

        // Continue to next provider
        if (this.providers.indexOf(providerConfig) < this.providers.length - 1) {
          console.log(`[SmsService] Falling back to next provider...`);
        }
      }
    }

    // All providers failed
    console.error('[SmsService] All SMS providers failed');
    return {
      success: false,
      provider: 'none',
      error: 'All SMS providers failed',
      attemptedProviders,
    };
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Send verification code SMS
   */
  async sendVerificationCode(phoneNumber: string, code: string): Promise<SmsResult> {
    const message = `Votre code de vérification Meeshy est: ${code}. Ce code expire dans 10 minutes.`;

    return this.sendSms({
      to: phoneNumber,
      message,
    });
  }

  /**
   * Send password reset code SMS
   */
  async sendPasswordResetCode(phoneNumber: string, code: string): Promise<SmsResult> {
    const message = `Votre code de réinitialisation Meeshy est: ${code}. Ce code expire dans 15 minutes.`;

    return this.sendSms({
      to: phoneNumber,
      message,
    });
  }

  /**
   * Send generic SMS
   */
  async send(phoneNumber: string, message: string, sender?: string): Promise<SmsResult> {
    return this.sendSms({
      to: phoneNumber,
      message,
      sender,
    });
  }

  /**
   * Send login notification SMS
   */
  async sendLoginNotification(phoneNumber: string, location?: string): Promise<SmsResult> {
    const locationText = location ? ` depuis ${location}` : '';
    const message = `Nouvelle connexion à votre compte Meeshy${locationText}. Si ce n'était pas vous, contactez-nous immédiatement.`;

    return this.sendSms({
      to: phoneNumber,
      message,
    });
  }

  /**
   * Get list of configured providers (for debugging)
   */
  getConfiguredProviders(): string[] {
    return this.providers.map(p => p.name);
  }
}

// Singleton instance
export const smsService = new SmsService();
