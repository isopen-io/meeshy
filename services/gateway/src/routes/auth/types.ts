import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../services/AuthService';
import { PhoneTransferService } from '../../services/PhoneTransferService';
import { SmsService } from '../../services/SmsService';
import { RedisWrapper } from '../../services/RedisWrapper';

/**
 * Context shared across all auth route modules
 * Contains initialized services and dependencies
 */
export interface AuthRouteContext {
  fastify: FastifyInstance;
  authService: AuthService;
  phoneTransferService: PhoneTransferService;
  smsService: SmsService;
  redisWrapper: RedisWrapper;
  redis: any;
  prisma: any;
}

/**
 * Standard request body for login
 */
export interface LoginRequestBody {
  username: string;
  password: string;
  rememberDevice?: boolean;
}

/**
 * Standard request body for 2FA completion
 */
export interface TwoFactorRequestBody {
  twoFactorToken: string;
  code: string;
  rememberDevice?: boolean;
}

/**
 * Standard user response format
 * Used consistently across all auth routes
 */
export interface UserResponseData {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  bio: string | null;
  avatar: string | null;
  phoneNumber: string | null;
  role: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
  isOnline: boolean;
  lastActiveAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  twoFactorEnabledAt: Date | null;
  lastPasswordChange: Date | null;
  lastLoginIp: string | null;
  lastLoginLocation: string | null;
  lastLoginDevice: string | null;
  profileCompletionRate: number;
  createdAt: Date;
  updatedAt: Date;
  permissions?: any;
}

/**
 * Standard session response format
 */
export interface SessionResponseData {
  id: string;
  deviceType: string | null;
  browserName: string | null;
  osName: string | null;
  location: string | null;
  isMobile: boolean;
  isTrusted: boolean;
  createdAt: Date;
}

/**
 * Utility to format user data consistently across all routes
 */
export function formatUserResponse(user: any, permissions?: any): UserResponseData {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    bio: user.bio,
    avatar: user.avatar,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isActive: user.isActive,
    deactivatedAt: user.deactivatedAt,
    systemLanguage: user.systemLanguage,
    regionalLanguage: user.regionalLanguage,
    customDestinationLanguage: user.customDestinationLanguage,
    autoTranslateEnabled: user.autoTranslateEnabled,
    translateToSystemLanguage: user.translateToSystemLanguage,
    translateToRegionalLanguage: user.translateToRegionalLanguage,
    useCustomDestination: user.useCustomDestination,
    isOnline: user.isOnline,
    lastActiveAt: user.lastActiveAt,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    twoFactorEnabledAt: user.twoFactorEnabledAt,
    lastPasswordChange: user.lastPasswordChange,
    lastLoginIp: user.lastLoginIp,
    lastLoginLocation: user.lastLoginLocation,
    lastLoginDevice: user.lastLoginDevice,
    profileCompletionRate: user.profileCompletionRate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    permissions: permissions || user.permissions
  };
}

/**
 * Utility to format session data consistently
 */
export function formatSessionResponse(session: any, rememberDevice: boolean = false): SessionResponseData {
  return {
    id: session.id,
    deviceType: session.deviceType,
    browserName: session.browserName,
    osName: session.osName,
    location: session.location,
    isMobile: session.isMobile,
    isTrusted: rememberDevice || false,
    createdAt: session.createdAt
  };
}
