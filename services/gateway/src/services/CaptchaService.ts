/**
 * CAPTCHA Service for hCaptcha verification
 * Prevents automated bot attacks on password reset endpoints
 */

export interface CaptchaVerificationResult {
  success: boolean;
  challengeTs?: string;
  hostname?: string;
  errorCodes?: string[];
}

export class CaptchaService {
  private secretKey: string;
  private siteKey: string;
  private verifyUrl: string = 'https://hcaptcha.com/siteverify';

  // Cache verified tokens for 5 minutes to prevent replay attacks
  private verifiedTokens: Map<string, number> = new Map();
  private cacheTTL: number = 300000; // 5 minutes

  constructor() {
    this.secretKey = process.env.HCAPTCHA_SECRET || '';
    this.siteKey = process.env.HCAPTCHA_SITE_KEY || '';

    if (!this.secretKey || !this.siteKey) {
      console.warn('[CaptchaService] WARNING: hCaptcha credentials not configured');
    }

    // Start cleanup interval for expired tokens
    this.startCleanup();
  }

  /**
   * Verify hCaptcha token
   */
  async verify(token: string, remoteIp?: string): Promise<CaptchaVerificationResult> {
    // Check if we've already verified this token (prevent replay attacks)
    if (this.isTokenVerified(token)) {
      return {
        success: false,
        errorCodes: ['token-already-used']
      };
    }

    try {
      const params = new URLSearchParams({
        secret: this.secretKey,
        response: token
      });

      // Include remote IP if provided (optional but recommended)
      if (remoteIp) {
        params.append('remoteip', remoteIp);
      }

      const response = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        console.error('[CaptchaService] hCaptcha API error:', response.status);
        return {
          success: false,
          errorCodes: ['http-error']
        };
      }

      const data = await response.json();

      if (data.success) {
        // Cache the token to prevent replay attacks
        this.cacheToken(token);
      }

      return {
        success: data.success || false,
        challengeTs: data.challenge_ts,
        hostname: data.hostname,
        errorCodes: data['error-codes'] || []
      };
    } catch (error) {
      console.error('[CaptchaService] Verification error:', error);
      return {
        success: false,
        errorCodes: ['network-error']
      };
    }
  }

  /**
   * Check if development mode should bypass CAPTCHA
   */
  shouldBypassInDev(): boolean {
    return process.env.NODE_ENV === 'development' &&
           process.env.BYPASS_CAPTCHA === 'true';
  }

  /**
   * Verify with development bypass option
   */
  async verifyWithDevBypass(token: string, remoteIp?: string): Promise<CaptchaVerificationResult> {
    if (this.shouldBypassInDev()) {
      console.log('[CaptchaService] DEV MODE: Bypassing CAPTCHA verification');
      return {
        success: true,
        challengeTs: new Date().toISOString(),
        hostname: 'localhost'
      };
    }

    return this.verify(token, remoteIp);
  }

  /**
   * Get site key for frontend
   */
  getSiteKey(): string {
    return this.siteKey;
  }

  /**
   * Check if token is already verified (cached)
   */
  private isTokenVerified(token: string): boolean {
    const timestamp = this.verifiedTokens.get(token);
    if (!timestamp) return false;

    // Check if token is still valid (within TTL)
    if (Date.now() - timestamp > this.cacheTTL) {
      this.verifiedTokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Cache verified token
   */
  private cacheToken(token: string): void {
    this.verifiedTokens.set(token, Date.now());
  }

  /**
   * Start cleanup interval for expired tokens
   */
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let deletedCount = 0;

      for (const [token, timestamp] of this.verifiedTokens.entries()) {
        if (now - timestamp > this.cacheTTL) {
          this.verifiedTokens.delete(token);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[CaptchaService] Cleaned ${deletedCount} expired tokens`);
      }
    }, 60000); // Run every minute
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cachedTokens: number; cacheSize: number } {
    return {
      cachedTokens: this.verifiedTokens.size,
      cacheSize: this.verifiedTokens.size
    };
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.verifiedTokens.clear();
    console.log('[CaptchaService] Cache cleared');
  }
}
