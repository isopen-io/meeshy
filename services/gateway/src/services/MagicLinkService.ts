/**
 * Magic Link Service - Passwordless authentication via email
 *
 * Security Features:
 * - SHA-256 hashed tokens
 * - 1 minute token expiry
 * - Single-use tokens
 * - Rate limiting (3 requests per hour per email)
 * - Device tracking (IP, location, browser)
 * - Security event logging
 * - Automatic session creation with full context
 */

import crypto from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RedisWrapper } from './RedisWrapper';
import { EmailService } from './EmailService';
import { GeoIPService, RequestContext } from './GeoIPService';
import { createSession, initSessionService, generateSessionToken } from './SessionService';

const TOKEN_EXPIRY_MINUTES = 1; // 1 minute as per requirement
// Higher limit in development for testing, strict in production
const MAX_REQUESTS_PER_HOUR = process.env.NODE_ENV === 'production' ? 3 : 20;

export interface MagicLinkRequest {
  email: string;
  deviceFingerprint?: string;
  ipAddress: string;
  userAgent: string;
  rememberDevice?: boolean; // Stored server-side for security
}

export interface MagicLinkValidation {
  token: string;
  requestContext: RequestContext;
}

export class MagicLinkService {
  constructor(
    private prisma: PrismaClient,
    private redis: RedisWrapper,
    private emailService: EmailService,
    private geoIPService: GeoIPService
  ) {
    // Initialize session service with prisma
    initSessionService(prisma);
  }

  /**
   * Request a magic link to be sent to the user's email
   * Always returns success to prevent email enumeration
   */
  async requestMagicLink(
    request: MagicLinkRequest
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const { email, deviceFingerprint, ipAddress, userAgent, rememberDevice } = request;
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // 1. Check rate limit
      const isRateLimited = await this.checkRateLimit(normalizedEmail, ipAddress);
      if (isRateLimited) {
        // Rate limiting can be signaled without revealing if email exists
        // because it's checked BEFORE user lookup
        console.warn('[MagicLink] Rate limit exceeded for:', normalizedEmail);
        return {
          success: false,
          message: 'Too many requests. Please try again in about an hour.',
          error: 'RATE_LIMITED'
        };
      }

      // 2. Find user by email
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          isActive: true
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          systemLanguage: true
        }
      });

      if (!user) {
        // Return success to prevent email enumeration
        console.log('[MagicLink] No user found for:', normalizedEmail);
        return { success: true, message: 'If an account exists, a login link has been sent.' };
      }

      // 3. Revoke any existing magic link tokens
      await this.prisma.magicLinkToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          isRevoked: false
        },
        data: {
          isRevoked: true,
          revokedReason: 'NEW_REQUEST'
        }
      });

      // 4. Generate token
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // 5. Get geolocation
      const geoData = await this.geoIPService.lookup(ipAddress);

      // 6. Store token
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await this.prisma.magicLinkToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress,
          userAgent,
          deviceFingerprint,
          geoLocation: geoData?.location || 'Unknown',
          geoCoordinates: geoData?.latitude && geoData?.longitude
            ? `${geoData.latitude},${geoData.longitude}`
            : null,
          rememberDevice: rememberDevice || false // Store server-side for security
        }
      });

      // 7. Send magic link email
      await this.sendMagicLinkEmail(user, rawToken, geoData?.location || 'Unknown');

      // 8. Log security event
      await this.logSecurityEvent(user.id, 'MAGIC_LINK_REQUESTED', 'LOW', {
        ipAddress,
        geoLocation: geoData?.location
      });

      console.log('[MagicLink] Token sent to:', normalizedEmail);
      return { success: true, message: 'If an account exists, a login link has been sent.' };

    } catch (error) {
      console.error('[MagicLink] Error requesting magic link:', error);
      // Return success to prevent info leakage
      return { success: true, message: 'If an account exists, a login link has been sent.' };
    }
  }

  /**
   * Validate magic link token and create session
   * Returns user and session data or error
   */
  async validateMagicLink(
    validation: MagicLinkValidation
  ): Promise<{
    success: boolean;
    error?: string;
    user?: any;
    token?: string;
    sessionToken?: string;
    session?: any;
    rememberDevice?: boolean; // Retrieved from server-side storage
  }> {
    const { token, requestContext } = validation;

    try {
      // 1. Hash the submitted token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 2. Find token in database
      const magicLinkToken = await this.prisma.magicLinkToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              userFeature: {
                select: {
                  twoFactorEnabledAt: true,
                  autoTranslateEnabled: true,
                  translateToSystemLanguage: true,
                  translateToRegionalLanguage: true,
                  useCustomDestination: true,
                  encryptionPreference: true
                }
              }
            }
          }
        }
      });

      // 3. Validate token exists
      if (!magicLinkToken) {
        console.warn('[MagicLink] Invalid token submitted');
        return { success: false, error: 'Invalid or expired link. Please request a new one.' };
      }

      // 4. Check if already used
      if (magicLinkToken.usedAt) {
        console.warn('[MagicLink] Token already used:', magicLinkToken.id);
        await this.logSecurityEvent(magicLinkToken.userId, 'MAGIC_LINK_REUSE_ATTEMPT', 'MEDIUM', {
          ipAddress: requestContext.ip
        });
        return { success: false, error: 'This link has already been used. Please request a new one.' };
      }

      // 5. Check if revoked
      if (magicLinkToken.isRevoked) {
        console.warn('[MagicLink] Token revoked:', magicLinkToken.id);
        return { success: false, error: 'This link is no longer valid. Please request a new one.' };
      }

      // 6. Check expiry (1 minute)
      if (magicLinkToken.expiresAt < new Date()) {
        console.warn('[MagicLink] Token expired:', magicLinkToken.id);
        await this.logSecurityEvent(magicLinkToken.userId, 'MAGIC_LINK_EXPIRED', 'LOW', {
          ipAddress: requestContext.ip,
          expiredAt: magicLinkToken.expiresAt.toISOString()
        });
        return { success: false, error: 'This link has expired. Please request a new one.' };
      }

      const user = magicLinkToken.user;

      // 7. Mark token as used
      await this.prisma.magicLinkToken.update({
        where: { id: magicLinkToken.id },
        data: { usedAt: new Date() }
      });

      // 8. Generate JWT token
      const jwt = require('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET || 'meeshy-secret-key-dev';
      const jwtToken = jwt.sign(
        { userId: user.id, username: user.username },
        jwtSecret,
        { expiresIn: '24h' }
      );

      // 9. Create session with full device tracking
      const sessionToken = generateSessionToken();
      const session = await createSession({
        userId: user.id,
        token: sessionToken,
        requestContext
      });

      // 10. Update user's last login info
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          lastLoginIp: requestContext.ip,
          lastLoginLocation: requestContext.geoData?.location || null,
          lastLoginDevice: requestContext.deviceInfo?.type || null
        }
      });

      // 11. Log security event
      await this.logSecurityEvent(user.id, 'MAGIC_LINK_LOGIN_SUCCESS', 'LOW', {
        ipAddress: requestContext.ip,
        geoLocation: requestContext.geoData?.location,
        deviceType: requestContext.deviceInfo?.type
      });

      console.log('[MagicLink] Login successful for:', user.email);

      // 12. Return user data (convert to SocketIOUser format)
      const socketIOUser = {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName || `${user.firstName} ${user.lastName}`,
        bio: user.bio,
        avatar: user.avatar,
        role: user.role,
        isOnline: true,
        lastActiveAt: new Date(),
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage,
        autoTranslateEnabled: user.userFeature?.autoTranslateEnabled ?? true,
        translateToSystemLanguage: user.userFeature?.translateToSystemLanguage ?? true,
        translateToRegionalLanguage: user.userFeature?.translateToRegionalLanguage ?? false,
        useCustomDestination: user.userFeature?.useCustomDestination ?? false,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        twoFactorEnabledAt: user.userFeature?.twoFactorEnabledAt ?? null
      };

      return {
        success: true,
        user: socketIOUser,
        token: jwtToken,
        sessionToken,
        session,
        rememberDevice: magicLinkToken.rememberDevice // Retrieved from server-side storage
      };

    } catch (error) {
      console.error('[MagicLink] Error validating token:', error);
      return { success: false, error: 'An error occurred. Please try again.' };
    }
  }

  /**
   * Check rate limit for magic link requests
   */
  private async checkRateLimit(email: string, ipAddress: string): Promise<boolean> {
    const emailKey = `ratelimit:magic-link:email:${email}`;

    try {
      // Check email rate limit
      const emailCount = await this.redis.get(emailKey);
      const count = emailCount ? parseInt(emailCount) : 0;

      if (count >= MAX_REQUESTS_PER_HOUR) {
        return true;
      }

      // Increment counter using setex (set with expiry)
      const newCount = count + 1;
      await this.redis.setex(emailKey, 3600, newCount.toString()); // 1 hour

      return false;
    } catch (error) {
      console.error('[MagicLink] Rate limit check error:', error);
      return false; // Allow on error to not block users
    }
  }

  /**
   * Send magic link email
   */
  private async sendMagicLinkEmail(
    user: { email: string; firstName: string; lastName: string; systemLanguage: string },
    token: string,
    location: string
  ): Promise<void> {
    const baseUrl = process.env.FRONTEND_URL || 'https://meeshy.me';
    const magicLinkUrl = `${baseUrl}/auth/magic-link?token=${encodeURIComponent(token)}`;

    await this.emailService.sendMagicLinkEmail({
      to: user.email,
      name: user.firstName,
      magicLink: magicLinkUrl,
      location,
      language: user.systemLanguage
    });
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(
    userId: string,
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          userId,
          eventType,
          severity,
          status: 'SUCCESS',
          metadata,
          ipAddress: metadata.ipAddress,
          geoLocation: metadata.geoLocation,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('[MagicLink] Error logging security event:', error);
    }
  }
}

/**
 * Factory function for creating MagicLinkService
 */
export function createMagicLinkService(
  prisma: PrismaClient,
  redis: RedisWrapper,
  emailService: EmailService,
  geoIPService: GeoIPService
): MagicLinkService {
  return new MagicLinkService(prisma, redis, emailService, geoIPService);
}
